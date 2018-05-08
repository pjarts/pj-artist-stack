const nock = require('nock')
const artists = require('../fixture/musicbrainz')

module.exports = () => {
  const artist = artists[0]
  const scope = nock('https://musicbrainz.org')
  artists.forEach(artist => {
    scope
      .get(`/ws/2/artist/${artist.id}`)
      .query({
        fmt: 'json',
        inc: 'release-groups+url-rels'
      })
      .reply(200, artist)
  })
  return scope
}