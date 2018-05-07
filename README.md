# pj-artist-stack
AWS stack with an API serving artist data gathered from open external APIs. The stack consists of an API Gateway, a Lambda function and a DynamoDB. The API GW has only one endpoint, `/artist/{mbid}` that takes a Musicbrainz id of an artist and returns a json object with extended data from Wikipedia and Cover Art Archive.

## How it works
When the Lambda is invoked by API Gateway it will first request data from DynamoDB. If Dynamo returns an empty result it will gather data from the external APIs, add an `expires` property to it and save it to Dynamo before it is returned to the caller.
DynamoDB is configured with a TTL on an the `expires` property and will remove an object when the expiration timestamp has passed. The lambda is configured to listen to the table's event stream and will automatically re-fetch all objects removed by the TTL. What you get in the end is an accumulating database of artists that will refresh every artist at a configured interval.

## Deploy
* Change the value of `ARTIFACT_BUCKET` in the Makefile to a new or existing bucket in your own AWS account.
* make sure you have you AWS credentials or AWS profile in your env variables
* run `npm install`
* run `make deploy`

## Testing

### Prerequisites
You need the following installed on your system in order to run the unit tests
* docker
* npm
* node 8

### Run tests
* `make start-db` will start a local instance of dynamodb
* npm test

## Built with
* Cloudformation
* Lambda
* DynamoDB
* API Gateway
* Node
* Koa

## To Do
* Linting
* Better error handling
* Move artist data to S3?
* Indexing?
