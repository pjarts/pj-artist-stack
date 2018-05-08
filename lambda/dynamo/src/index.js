const Lambda = require('aws-sdk/clients/lambda')

let lambda = new Lambda({ region: 'eu-west-1' })

const handler = (event, context, callback) => {
  if (!event.Records || Number(process.env.REFETCH === 0)) {
    callback(null)
  }
  const dynamoRecords = event.Records.filter(
    record => record.eventSource === 'aws:dynamodb'
      && record.eventName === 'REMOVE'
      // only trigger on expired items
      && record.dynamodb.OldImage.expires
      && record.dynamodb.OldImage.expires.N < Math.floor(Date.now() / 1000)
  )
  Promise.all(dynamoRecords.map(processRecord))
    .then(res => {
      const errors = res.filter(r => r instanceof Error)
      errors.forEach(e => {
        console.log(e)
      })
      callback(null)
    })
    .catch(err => {
      callback(err)
    })
}

module.exports = { handler }

function processRecord(record) {
  const mbid = record.dynamodb.Keys.mbid.S
  const params = {
    FunctionName: process.env.ARTIST_FUNCTION_NAME,
    Payload: JSON.stringify({
      pathParameters: {
        artist_id: mbid
      },
      httpMethod: 'GET',
      path: '/artist/' + mbid
    })
  }
  return lambda.invoke(params).promise()
    .catch(err => Promise.resolve(err))
}