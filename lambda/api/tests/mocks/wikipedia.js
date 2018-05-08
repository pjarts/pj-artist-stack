const nock = require('nock')
const wikis = require('../fixture/wikipedia')
const { match } = require('sinon')

module.exports = () => {
  const scope = nock('https://en.wikipedia.org')
  wikis.forEach(wiki => {
    const pageIds = Object.keys(wiki.query.pages)
    const titles = pageIds.map(pid => wiki.query.pages[pid].title)
    const matchTitles = match(function (titleStr) {
      const normalized = titleStr.replace('_', ' ').toLowerCase()
      return normalized === titles.join('|').toLowerCase()
    })
    scope
      .get(`/w/api.php`)
      .query(function (query) {
        return match({
          format: 'json',
          action: 'query',
          prop: 'extracts',
          exintro: match.defined,
          explaintext: match.defined,
          titles: matchTitles
        }).test(query)
      })
      .reply(200, wiki)
  })
  return scope
}