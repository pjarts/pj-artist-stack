const Koa = require('koa')
const Router = require('koa-router')
const cors = require('@koa/cors')
const logger = require('koa-logger')
const serverless = require('serverless-http')
const axios = require('axios')
const schemaFilter = require('json-schema-filter')
const DocumentClient = require('aws-sdk/clients/dynamodb').DocumentClient
const createError = require('http-errors')

const artistSchema = require('./schema/artist')

const dynamo = new DocumentClient({
  convertEmptyValues: true,
  region: 'eu-west-1'
})

let httpClient = axios.create({
  headers: {
    'User-Agent': 'pj-sami/1.0 (per@pjarts.se)'
  }
})

const app = new Koa()
const router = new Router()

router
  .get('/artist/:mbid', async function getArtist(ctx) {
    const { mbid } = ctx.params
    let artist = await getArtistFromDB(mbid)
    if (!artist) {
      await fetchAndSaveArtist(mbid)
      // fetch from the db in order to keep the responses consistent
      artist = await getArtistFromDB(mbid)
    }
    ctx.body = {
      result: artist
    }
  })

app
  .use(logger())
  .use(cors())
  .use(router.routes())
  .use(router.allowedMethods())

/**
 * Main handler function
 * @param {object} event 
 * @param {object} context 
 * @param {function} callback 
 */
const handler = (event, context, callback) => {
  // handle dynamodb event
  if (event.Records) {
    console.log(event, 'dynamodb event')
    return handleDynamoDBStream(event, context, callback)
  // handle API Gateway event
  } else {
    console.log(event, 'api gateway event')
    return serverless(app)(event, context, callback)
  }
}

module.exports = { handler }

/**
 * Handler function for DynamoDB stream events
 * @param {object} event 
 * @param {object} context 
 * @param {function} callback 
 */
async function handleDynamoDBStream (event, context, callback) {
  const dynamoRecords = event.Records.filter(
    record => record.eventSource === 'aws:dynamodb' 
      && record.eventName === 'REMOVE'
      // only trigger on expired items
      && record.dynamodb.OldImage.expires
      && record.dynamodb.OldImage.expires.N < Math.floor(Date.now() / 1000)
  )
  await Promise.all(
    dynamoRecords.map(record => {
      return fetchAndSaveArtist(record.dynamodb.Keys.mbid.S)
    })
  )
  callback(null)
}

/**
 * Fetches artist data from external APIs
 * and saves the result to the database
 * @param {string} mbid 
 */
async function fetchAndSaveArtist (mbid) {
  const data = await fetchArtistData(mbid)
  return await saveArtistToDB(data)
}

/**
 * Gets an artist object from the DB
 * @param {string} mbid 
 */
async function getArtistFromDB (mbid) {
  const params = {
    TableName: process.env.ARTIST_TABLE_NAME,
    Key: {
      mbid
    }
  }
  const res = await dynamo.get(params).promise()
  return res.Item
}

/**
 * Saves an artist object to the DB
 * @param {object} artist 
 */
async function saveArtistToDB (artist) {
  const params = {
    TableName: process.env.ARTIST_TABLE_NAME,
    Item: Object.assign(
      {},
      artist,
      { expires: Math.floor(Date.now() / 1000 + process.env.TTL) }
    ),
    ConditionExpression: 'attribute_not_exists(mbid)',
    ReturnValues: 'ALL_OLD'
  }
  const res = await dynamo.put(params).promise()
  return res
}

/**
 * Fetches artist data from MusicBrainz and Wikipedia and returns
 * an artist object
 * @param {string} mbid 
 */
async function fetchArtistData (mbid) {
  // get data from musicbrainz
  const mbData = await fetchMusicbrainzData(mbid)
  const wikiTitle = getWikipediaTitle(mbData.relations)
  const wikiData = wikiTitle ? await fetchWikipediaData(wikiTitle) : null
  const coverData = await Promise.all(mbData['release-groups'].map(
    rg => fetchCoverData(rg.id)
  ))
  return {
    mbid: mbData.id,
    name: mbData.name,
    type: mbData.type,
    country: mbData.country,
    gender: mbData.gender,
    releases: mbData['release-groups'].map((r, idx) => {
      const cover = coverData[idx] && getFrontCover(coverData[idx].images)
      return {
        title: r.title,
        id: r.id,
        primaryType: r['primary-type'],
        releaseDate: r['first-release-date'],
        cover: cover && {
          image: cover.image,
          thumbnails: cover.thumbnails
        }
      }
    }),
    description: wikiData.extract
  }
}

function getFrontCover (coverList) {
  return coverList.find(c => c.front) || coverList[0]
}

function getWikipediaTitle (urlRels) {
  const rel = urlRels.find(r => r.type === 'wikipedia')
  // res.url.resource is the link to the wiki article
  return rel && rel.url.resource.split('/').pop()
}

/**
 * Get data from Musicbrainz
 * @param {string} mbid 
 */
async function fetchMusicbrainzData (mbid) {
  try {
    const res = await httpClient({
      method: 'get',
      url: 'https://musicbrainz.org/ws/2/artist/' + mbid,
      params: {
        fmt: 'json',
        inc: 'release-groups+url-rels'
      }
    })
    return res.data
  } catch (err) {
    if (err.response) {
      if (err.response.status === 404) {
        throw createError.NotFound('Artist does not exist')
      }
      if (err.response.status === 400) {
        throw createError.BadRequest('Malformed mbid')
      }
      throw err
    }
  }
}

/**
 * Get data from Wikipedia
 * @param {string} title 
 */
async function fetchWikipediaData (title) {
  try {
    const res = await httpClient({
      method: 'get',
      url: 'https://en.wikipedia.org/w/api.php',
      params: {
        format: 'json',
        action: 'query',
        prop: 'extracts',
        exintro: '1',
        explaintext: '1',
        titles: title
      }
    })
    const pageId = Object.keys(res.data.query.pages)[0]
    return res.data.query.pages[pageId]
  } catch (err) {
    // don't throw if response is 404
    if (err.response && err.response.status === 404) {
      return null
    }
    throw err
  }
}

/**
 * Get data from Cover Art Archive
 * @param {string} mbid 
 */
async function fetchCoverData (mbid) {
  try {
    const res = await httpClient({
      method: 'get',
      url: 'https://coverartarchive.org/release-group/' + mbid
    })
    return res.data
  } catch (err) {
    // don't throw anything if response is 404
    if (err.response && err.response.status === 404) {
      return null
    }
    throw err
  }
}