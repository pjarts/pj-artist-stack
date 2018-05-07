const ARTIST_TABLE_NAME = 'artist-table'

const nock = require('nock')
const { mockService } = require('@mindhive/mock-aws')
const AWS = require('aws-sdk/global')
const DynamoDB = require('aws-sdk/clients/dynamodb')
const rewire = require('rewire')
const lambdaTester = require('lambda-tester')
const { validate } = require('jsonschema')
const { spy } = require('sinon')

const artistTable = require('./fixture/artistTable')
const musicbrainz = require('./fixture/musicbrainz')
const musicbrainzApiMock = require('./mocks/musicbrainz')
const wikipediaApiMock = require('./mocks/wikipedia')
const coverartarchiveMock = require('./mocks/coverartarchive')

const artistSchema = require('../src/schema/artist')

const dynamodb = new DynamoDB({ 
  region: 'eu-west-1',
  endpoint: new AWS.Endpoint('http://localhost:8000')
})
const docClient = new DynamoDB.DocumentClient({
  service: dynamodb
})

describe('artist lambda', () => {
  let mbMock
  let wikiMock
  let coverartMock
  let lambda
  beforeEach(async () => {
    nock.cleanAll()
    mbMock = musicbrainzApiMock()
    wikiMock = wikipediaApiMock()
    coverartMock = coverartarchiveMock()
    lambda = rewire('../src')
    lambda.__get__('dynamo').service = dynamodb
    lambda.__get__('process').env = {
      ARTIST_TABLE_NAME,
      TTL: 60
    }
    await createArtistTable()
    await populateArtistTable()
  })
  afterEach(async () => {
    await deleteArtistTable()
  })

  it('returns an artist from the database', async () => {
    const artist = artistTable[0]
    await lambdaTester(lambda.handler)
      .event(apiGwEvent(artist.mbid))
      .expectResult(res => {
        const body = JSON.parse(res.body)
        // no API was called
        expect(mbMock.isDone()).toBe(false)
        expect(wikiMock.isDone()).toBe(false)
        // artist was returned
        expect(res.statusCode).toBe(200)
        expect(body.result).toEqual(artist)
      })
  })

  it('does not call any external apis if the artist exists in the db', async () => {
    const artist = artistTable[0]
    const httpSpy = spy(lambda.__get__('httpClient'))
    lambda.__set__('httpClient', httpSpy)
    await lambdaTester(lambda.handler)
      .event(apiGwEvent(artist.mbid))
      .expectResult(res => {
        expect(httpSpy.notCalled).toBe(true)
      })
  })

  it('fetches data from musicbrainz if the artist does not exist in the db', async () => {
    const artist = musicbrainz[0]
    const mbSpy = spy(lambda.__get__('fetchMusicbrainzData'))
    lambda.__set__('fetchMusicbrainzData', mbSpy)
    await lambdaTester(lambda.handler)
      .event(apiGwEvent(artist.id))
      .expectResult(() => {
        expect(mbSpy.withArgs(artist.id).calledOnce).toBe(true)
      })
  })

  it('fetches data from wikipedia if the artist does not exist in the db', async () => {
    const artist = musicbrainz[0]
    const wikiSpy = spy(lambda.__get__('fetchWikipediaData'))
    lambda.__set__('fetchWikipediaData', wikiSpy)
    await lambdaTester(lambda.handler)
      .event(apiGwEvent(artist.id))
      .expectResult(() => {
        expect(wikiSpy.calledOnce).toBe(true)
      })
  })

  it('fetches data from coverartarchive if the artist does not exist in the db', async () => {
    const artist = musicbrainz[0]
    const coverSpy = spy(lambda.__get__('fetchCoverData'))
    lambda.__set__('fetchCoverData', coverSpy)
    await lambdaTester(lambda.handler)
      .event(apiGwEvent(artist.id))
      .expectResult(() => {
        expect(coverSpy.getCalls().length).toBe(artist['release-groups'].length)
      })
  })

  it('saves fetched artist data to the db', async () => {
    const artist = musicbrainz[0]
    const mbid = artist.id
    const lambdaRes = await lambdaTester(lambda.handler)
      .event(apiGwEvent(mbid))
      .expectResult()
    // check if artist exists in db
    const params = {
      TableName: ARTIST_TABLE_NAME,
      Key: { mbid }
    }
    const res = await docClient.get(params).promise()
    expect(res.Item).toBeDefined()
    expect(res.Item.name).toBe('kent')
  })

  it('adds an `expires` attribute to the data set saved to the db', async () => {
    const artist = musicbrainz[0]
    const mbid = artist.id
    const lambdaRes = await lambdaTester(lambda.handler)
      .event(apiGwEvent(mbid))
      .expectResult()
    // check if artist exists in db
    const params = {
      TableName: ARTIST_TABLE_NAME,
      Key: { mbid }
    }
    const res = await docClient.get(params).promise()
    expect(res.Item).toBeDefined()
    expect(res.Item.expires).toBeGreaterThan(Date.now() / 1000) // seconds
  })

})

function createArtistTable () {
  const params = {
    TableName: ARTIST_TABLE_NAME,
    AttributeDefinitions: [{
      AttributeName: 'mbid',
      AttributeType: 'S'
    }],
    KeySchema: [{
      AttributeName: 'mbid',
      KeyType: 'HASH'
    }],
    ProvisionedThroughput: {
      ReadCapacityUnits: 100,
      WriteCapacityUnits: 100
    }
  }
  return dynamodb.createTable(params).promise()
}

function populateArtistTable () {
  const params = {
    RequestItems: {
      [ARTIST_TABLE_NAME]: artistTable.map(Item => ({
        PutRequest: { Item }
      }))
    }
  }
  return docClient.batchWrite(params).promise()
}

function deleteArtistTable () {
  const params = {
    TableName: ARTIST_TABLE_NAME
  }
  return dynamodb.deleteTable(params).promise()
}

function apiGwEvent (artistId) {
  return {
    "resource": "/artist/{artist_id}",
    "requestContext": {
      "resourcePath": "/artist/{artist_id}"
    },
    "pathParameters": {
      "artist_id": artistId
    },
    "httpMethod": "GET",
    "path": "/artist/" + artistId
  }
}
