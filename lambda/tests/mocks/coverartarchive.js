const nock = require('nock')
const musicbrainz = require('../fixture/musicbrainz')
const coverArt = require('../fixture/coverartarchive')

module.exports = () => {
  const scope = nock('https://coverartarchive.org')
  const releaseGroups = musicbrainz.reduce(
    (rg, artist) => rg.concat(artist['release-groups']),
    []
  )
  releaseGroups.forEach(rg => {
    const cover = coverArt[rg.id]
    const status = cover ? 200 : 404
    const body = cover ? cover : 'not found'
    scope
      .get(`/release-group/${rg.id}`)
      .reply(status, body)
  })
  return scope
}
