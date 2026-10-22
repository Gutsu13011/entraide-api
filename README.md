# Entraide API

NestJS backend for Entraide, a personal project focused on connecting
people with local service providers.

## Project background

Entraide started as a personal project to learn Angular and NestJS
through practice. It is now evolving into a full-stack portfolio
application, with the longer-term ambition of becoming a real local
service.

## Current features

- Service provider management
- Pagination, search, filtering and sorting
- Provider reviews tied to completed service requests, with requester-only creation and one review per request
- Multiple service offerings per provider, with free or hourly pricing
- Authenticated service requests with private sent and received lists, historical offering snapshots and recipient-only status updates
- SQLite persistence with TypeORM migrations
- Request validation and interactive Swagger documentation
- Health checks and request logging
- Unit and end-to-end tests
- GitHub Actions workflow for automated checks
- Authentication and user accounts
- One provider profile per account, with owner-only profile management and offering creation, updates and deletion

## Project status

The application is under active development.
User registration, login and a protected profile endpoint are available.
Provider ownership and authorization are implemented for profile updates,
deletion, and service offering creation, updates and deletion. Service request
creation, private sent and received lists, and recipient-only status updates
are available. Recipients can mark a request as read, accept it or reject it,
and mark an accepted request as completed. Requesters can review completed
services, with one review per request and a public response that excludes
private request links. Reply messages are planned.
The current version is intended for local development and demonstration.

## Requirements

- Node.js 26
- npm

## Local setup

Run these commands from the project directory:

```bash
npm ci &&
cp .env.example .env
```

Generate a secret with `openssl rand -base64 32` and paste its output after
`JWT_SECRET=` in `.env`. Do this before starting the API. Never commit `.env`.

```bash
npm run migration:run &&
npm run start:dev
```

For an existing installation, keep your current `.env` file and ensure
`JWT_SECRET` is set.

The default configuration uses port `3000` and a local SQLite database
named `entraide.sqlite`. Migrations create the database schema.
A fresh database contains no service providers.

Local endpoints:

- API: http://localhost:3000
- Swagger UI: http://localhost:3000/api
- Health check: http://localhost:3000/health

Service offering endpoints:

- `GET /service-providers/:serviceProviderId/service-offerings` lists a provider's offerings.
- `POST /service-providers/:serviceProviderId/service-offerings` creates an offering.
- `PATCH /service-providers/:serviceProviderId/service-offerings/:id` partially updates an offering.
- `DELETE /service-providers/:serviceProviderId/service-offerings/:id` deletes an offering.

Offering creation, updates and deletion require ownership of the provider profile.
Successful offering deletion returns `204 No Content`. It removes only the selected
offering; the provider profile and its other offerings remain unchanged. An offering
not found under the specified provider returns `404 Not Found`.
When updating an offering:

- Changing from `HOURLY` to `FREE` clears the hourly rate to `null` when no rate is supplied.
- Changing from `FREE` to `HOURLY` requires a strictly positive hourly rate.
- Omitted fields keep their existing values, except for the rate when changing to `FREE`.
- An explicit `null` rate is allowed for `FREE`, but rejected for `HOURLY`.
- A non-null rate is rejected for `FREE`; supplied numeric rates must be strictly positive.
- An offering not found under the specified provider returns `404 Not Found`.

Service providers can be created through Swagger UI with a valid access token.
The Angular frontend sends access tokens with authenticated API requests.

## Authentication

- `POST /auth/register` creates a user.
- `POST /auth/login` returns an `accessToken`.
- `GET /auth/me` returns the authenticated user's public profile.

Send `Authorization: Bearer <accessToken>` when calling protected endpoints.
In Swagger UI, use the **Authorize** button with the token returned by login.

The following operations require a valid access token:

- `POST /service-providers`
- `PATCH /service-providers/:id`
- `DELETE /service-providers/:id`
- `POST /service-providers/:serviceProviderId/service-offerings`
- `PATCH /service-providers/:serviceProviderId/service-offerings/:id`
- `DELETE /service-providers/:serviceProviderId/service-offerings/:id`
- `POST /service-providers/:serviceProviderId/reviews`
- `POST /service-providers/:serviceProviderId/service-offerings/:serviceOfferingId/service-requests`
- `GET /service-requests/sent`
- `GET /service-requests/received`
- `PATCH /service-requests/:id/status`
- `POST /service-requests/:id/messages`
- `GET /service-requests/:id/messages`
- `PATCH /service-requests/:id/messages/read`

Provider, offering and review consultation endpoints remain public.

### Provider ownership

Each account can create at most one service provider profile. The API derives
its owner from the verified access token and uses the account's first and last
names when creating the profile. A client-supplied `ownerUserId` is rejected.
A second profile creation for the same account returns `409 Conflict`.

Only the profile owner can update or delete it, or create, update and delete its service offerings.
Attempts by another authenticated user return `403 Forbidden`.
Review creation is restricted to the requester of a completed service request,
as described in the reviews section below.

Existing and demo profiles have no owner (`ownerUserId: null`). They remain
publicly readable, but authenticated users cannot update or delete them, or
create, update or delete offerings on them. The ownership migration preserves existing profiles,
reviews and offerings.

When reverting `AddServiceProviderOwner`, use `--transaction none` to preserve
related data. If it is the latest applied migration, run:

```bash
npm run migration:revert -- --transaction none
```

## Service requests

All service request endpoints require a valid access token:

- `POST /service-providers/:serviceProviderId/service-offerings/:serviceOfferingId/service-requests`
  sends a request for an offering and returns `201 Created`.
- `GET /service-requests/sent` lists requests sent by the authenticated account.
- `GET /service-requests/received` lists requests addressed to the authenticated account.
- `PATCH /service-requests/:id/status` changes the status of a request addressed to the authenticated account and returns `200 OK`.
- `POST /service-requests/:id/messages` sends a reply as either participant and returns `201 Created`.
- `GET /service-requests/:id/messages` returns the conversation replies to either participant with `200 OK`.
- `PATCH /service-requests/:id/messages/read` marks received replies as read through a message boundary and returns `204 No Content`.

The creation body contains only the message:

```json
{
  "message": "Bonjour, je souhaiterais faire repeindre ma chambre."
}
```

The message must be a string containing at least one non-whitespace character.
Additional body fields are rejected. The API derives the requester from the
verified token and the recipient from the provider profile's owner. It copies
the offering's title, pricing type and hourly rate into the request and sets
its initial status to `SENT`.

Creation, list and status update responses use the same format. Each request includes
`requester` and `recipient` objects containing only the account's `id`,
`firstName` and `lastName`. Emails, password hashes and internal user relations
are excluded from these responses. Participant names reflect the current
accounts; the offering title and pricing remain snapshots of the request.

Each response also includes the required boolean `hasReview`, derived from the
review linked to that specific request. A completed request without a review
returns `false`; publishing its review makes subsequent sent and received list
responses return `true`, including after leaving and reopening the page.
Other requests to the same provider keep their own independent value. The
loaded review object, its rating and its comment are not embedded in these
private request responses. No additional database column or migration is needed.
Deleting only the offering preserves the review and `hasReview`; deleting the
provider removes its reviews, so retained requests return `hasReview: false`
and `serviceProviderId: null`.

The offering must belong to the provider specified in the URL. A missing
provider or an offering not found for that provider returns `404 Not Found`.
An offering on a profile without an owner cannot receive requests and returns
`409 Conflict`.

Sent and received lists are private, ordered by creation date descending,
then by id descending when dates match. Accounts with no matching requests
receive an empty array. Account identifiers supplied in query parameters do
not override the identity from the token.

Changing an offering's title or pricing leaves existing request snapshots
unchanged. Deleting the offering, including through provider profile deletion,
preserves the request and its recipient, and sets `serviceOfferingId` to `null`.
Requests also store and return a direct, nullable `serviceProviderId`. New
requests derive this id from the provider loaded by the API, independently of
the recipient's account id. A client-supplied provider id in the body is
rejected. Deleting only the offering preserves this profile link; deleting
the provider sets it to `null` and still preserves the request.

The `AddServiceRequestProvider` migration fills this link for existing
requests whose offering still exists. Older requests without an offering
keep a null link. The migration adds the column, foreign key and index
without rebuilding provider or offering tables. Creation, sent and received
lists, and status updates all return `serviceProviderId`, including an explicit
`null` when the profile link is unavailable. This is the profile id, not the
recipient account id.

The snapshot records the offering at the time of the request; sending a request
does not mean the provider has accepted the work.

### Status updates

Use the service request's id in the URL, and send only the target status:

```json
{
  "status": "ACCEPTED"
}
```

Only the recorded recipient can change the status. The requester and other
accounts receive `403 Forbidden`. This permission remains valid after the
original offering or provider profile is deleted.

Allowed transitions are:

- `SENT` → `READ`, `ACCEPTED` or `REJECTED`.
- `READ` → `ACCEPTED` or `REJECTED`.
- `ACCEPTED` → `COMPLETED`.
- `REJECTED` and `COMPLETED` are final in the current workflow.

To finish a service, the recorded recipient sends `{ "status": "COMPLETED" }`
to the same PATCH endpoint. Only an accepted request can be completed:
`SENT` or `READ` cannot transition directly to `COMPLETED`. The requester
cannot mark it as completed. Sent and received lists include the completed
status in their responses. This transition remains available if the original
offering or provider profile was deleted. Completion currently records only
the status; it does not add a completion timestamp or a review.

Missing or invalid statuses, including `SENT` as a target, and extra body fields
return `400 Bad Request`. A missing request returns `404 Not Found`.
Repeating the current status or requesting a forbidden transition returns
`409 Conflict`. The update also checks the previously read status in the
SQL write: if another action changed the request meanwhile, it returns `409`
instead of overwriting that decision. Refresh the request before trying again.

A status update leaves the message, participants, creation date and offering
snapshots unchanged. Sent and received GET endpoints never change the status;
marking a request as read requires an explicit PATCH request.

## Service request messages

The `CreateServiceRequestMessagesTable` migration adds a separate table for
replies to service requests. The initial request text remains in
`service_requests.message`. Each reply stores its content, creation date,
nullable `readAt`, request id and author account id. New messages start unread.
A composite non-unique index on request id, creation date and id supports
chronological history; another index covers the author id.

Deleting a request cascades to its replies. Deleting an author account is
restricted while its messages exist. Deleting only an offering or provider
preserves the retained request and its messages. Reverting this migration
removes the messages table and its contents while retaining existing tables.

`POST /service-requests/:id/messages` sends a reply and returns `201 Created`.
It requires a valid bearer token and access as the recorded requester or
recipient. A missing request returns `404 Not Found`; an unrelated account
receives `403 Forbidden`. Access remains available after offering or provider
deletion because it uses the participants stored on the retained request.

The body contains only `content`, a string with at least one non-whitespace
character and a maximum length of 2000 characters. Empty or invalid content
and additional body fields return `400 Bad Request`. The API derives the
author from the authenticated account and sets `readAt` to `null`. It preserves
the submitted text, including surrounding whitespace and line breaks.

The response contains `id`, `content`, `createdAt`, `readAt`, `serviceRequestId`,
`authorUserId` and `author`. The author object contains only `id`, `firstName`
and `lastName`; account emails, password hashes and internal relations are
excluded. Sending a reply does not change the request's status or snapshots,
or mark earlier messages as read.

`GET /service-requests/:id/messages` returns only that request's replies, ordered
by creation date ascending and then id ascending. It requires the same
participant access check as sending, including for an empty conversation. An
accessible request without replies returns `[]`. Query parameters cannot
change the selected request or authenticated account. Each item uses the safe
message response described above. Repeated reads do not change message read
dates or request status, and history remains available after offering or
provider deletion. The initial request text remains separate from this list.

`PATCH /service-requests/:id/messages/read` accepts only a positive integer
`upToMessageId` and returns `204 No Content` with no response body. The client
supplies the highest identifier among the displayed messages. The API first
checks participation, then checks that this boundary belongs to that request.
A missing request or a boundary absent from that conversation returns `404`;
an unrelated account receives `403`. Invalid identifiers, invalid boundaries
and additional body fields return `400`.

The update applies only to this request's messages written by the other
participant, with a null `readAt` and an id at or below the boundary. The server
sets one read timestamp. Own messages, later messages, other conversations and
existing read dates remain unchanged. Repeating the operation, including when
no message needs updating, succeeds without replacing prior read dates. This
operation does not change the request's status. There is no mutating GET route.

Frontend conversations and unread-message counters will follow. In-app
notifications, real-time delivery and delayed email reminders for unread
messages are planned later.

## Reviews

- `POST /service-providers/:serviceProviderId/reviews` creates an authenticated review.
- `GET /service-providers/:serviceProviderId/reviews` publicly lists reviews.
- `GET /service-providers/:serviceProviderId/reviews/summary` publicly returns the review count and average rating.

The creation body contains the completed request identifier, a rating from 1 to 5,
and a non-empty comment:

```json
{
  "serviceRequestId": 41,
  "rating": 5,
  "comment": "Excellent service"
}
```

The request must belong to the provider specified in the URL, have status
`COMPLETED`, and have been sent by the authenticated account. The API derives
`authorName` from that requester's account. Client-supplied author names,
requester identifiers and provider identifiers in the body are rejected.

A missing provider or a request not found for that provider returns `404 Not Found`.
An authenticated account other than the requester, including the recipient,
receives `403 Forbidden`. A request that is not completed or already has a review
returns `409 Conflict`. A unique database index also prevents duplicate reviews
when submissions overlap; the competing insertion returns the same conflict.
Different completed requests to the same provider may each receive a review.

Creation and list responses contain only `id`, `authorName`, `rating`, `comment`,
`createdAt` and `serviceProviderId`. The request identifier and internal relations
are retained in storage where applicable and excluded from public responses.
Creating a review leaves the associated request unchanged.

The `LinkReviewsToServiceRequests` migration preserves legacy and demonstration
reviews with a null request link. These reviews remain publicly readable and
included in rating summaries. New reviews submitted through the API require a
completed request. Demo reviews use a separate validation DTO.

Deleting an offering preserves the request's provider link, so a completed
request can still be reviewed. Deleting the provider removes its reviews and
clears the provider link on retained requests. Recreating a profile for the same
account does not make these old requests eligible for reviews on the new profile.
A request referenced by a review cannot be deleted while that review exists.

## Demo data

To populate an empty local database with 12 fictional service providers,
7 reviews and 14 service offerings, configure your `.env` file, then run:

```bash
npm run build &&
npm run migration:run:prod &&
npm run seed:demo
```

The seed uses the database configured by `DATABASE_PATH`. It validates
the demo profiles, reviews and offerings, then inserts them in a single
database transaction.

If any service provider already exists, the seed is skipped. Existing
data is never deleted or replaced.

The dataset includes different professions, cities, hourly rates and
availability values. With the default page size of 10, it provides two
pages of providers.

The reviews are linked to six provider profiles. Sophie Martin has two
reviews, demonstrating the review count and average rating.

Each provider has an hourly offering. Sophie Martin and Hugo Petit each
have an additional free offering, demonstrating that one provider can
offer services with independent pricing.

When migrating a database that already contains providers, the migration
creates one hourly offering for each existing provider using its
profession, description and hourly rate. The seed does not add its demo
offerings to a database that already contains providers.

This command is intended for local development and demonstrations.

## Frontend integration

The Angular frontend is maintained in the separate `entraide-web` project.
Start it in another terminal by following its README.

The API currently allows browser requests from `http://localhost:4200`.

## Production

Configure the environment variables before starting the application:

```dotenv
NODE_ENV=production
PORT=3000
DATABASE_PATH=entraide.sqlite
JWT_SECRET=
```

Set `JWT_SECRET` to a new random value for this deployment before starting
the application. The API will not start with an empty value.

Then install, build, migrate, and start the application in this order:

```bash
npm ci &&
npm run build &&
npm run migration:run:prod &&
npm run start:prod
```

Database migrations are executed as a separate deployment step before the application starts.

## Quality checks

```bash
npm run format:check &&
npm run lint &&
npm run build &&
npm test &&
npm run test:e2e
```

End-to-end tests use an in-memory SQLite database initialized through
the application migrations.

To generate a test coverage report:

```bash
npm run test:cov
```

## Continuous integration

The GitHub Actions workflow runs on pushes and pull requests targeting
`main`. It checks formatting, linting, the production build, production
migrations, unit tests and end-to-end tests.

## Planned improvements

- Frontend conversations and unread-message counters
- Real-time message notifications
- Delayed email reminders for unread messages
