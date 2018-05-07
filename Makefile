STAGE ?= dev
PROJECT = pj-artist-api
REGION ?= eu-west-1
ARTIFACT_BUCKET = pjarts-deploy-bucket
ARTIFACT_PREFIX = pj-artist-api

put_swagger = aws s3 cp cloudformation/swagger.yml s3://$(ARTIFACT_BUCKET)/$(ARTIFACT_PREFIX)/swagger/swagger-$(shell git rev-parse HEAD).yml
sam_package = aws cloudformation package \
                --template-file cloudformation/$(1).yml \
                --output-template-file dist/$(1).yml \
                --s3-bucket $(ARTIFACT_BUCKET) \
                --s3-prefix $(ARTIFACT_PREFIX)

sam_deploy = aws cloudformation deploy \
	     	--template-file dist/$(1).yml \
			--stack-name $(PROJECT)-$(1)-$(STAGE) \
			--region $(REGION) \
			--parameter-overrides \
				App=$(PROJECT) \
				Stage=$(STAGE) \
				Swagger=s3://$(ARTIFACT_BUCKET)/$(ARTIFACT_PREFIX)/swagger/swagger-$(shell git rev-parse HEAD).yml \
				Region=$(REGION) \
				--capabilities CAPABILITY_NAMED_IAM

start-db:
	docker run -d -p 8000:8000 cnadiminti/dynamodb-local

# Deploy API GW and lambdas. Targets cf has dependencies on deploy-staff-cognito, deploy-persistent, deploy-influencer-cognito, influencers-cognito.yml
deploy:
	@echo "Running deploy target for $(STAGE)"
	@echo "Packaging template"
	$(call sam_package,stack)
	$(call put_swagger)
	@echo "Deploying stack"
	$(call sam_deploy,stack)


