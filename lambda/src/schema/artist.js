const release = require('./release')

module.exports = {
  "$id": "http://example.com/example.json",
  "type": "object",
  "definitions": {},
  "$schema": "http://json-schema.org/draft-07/schema#",
  "properties": {
    "mbid": { "type": "string" },
    "releases": {
      "type": "array",
      "items": release
    },
    "name": { "type": "string" },
    "type": { "type": "string" },
    "country": { "type": "string" },
    "gender": { "type": ["string", "null"] },
    "description": { "type": "string" }
  }
}
