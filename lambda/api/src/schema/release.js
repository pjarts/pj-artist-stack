const cover = require('./cover')

module.exports = {
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "id": { "type": "string" },
    "cover": {
      "oneOf": [
        cover,
        "null"
      ]
    },
    "primaryType": { "type": "string" },
    "releaseDate": { "type": ["null", "string"] }
  }
}
