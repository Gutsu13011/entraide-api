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
- Provider reviews
- Multiple service offerings per provider, with free or hourly pricing
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
deletion, and service offering creation, updates and deletion. Service requests are planned.
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

Provider, offering and review consultation endpoints remain public.

### Provider ownership

Each account can create at most one service provider profile. The API derives
its owner from the verified access token and uses the account's first and last
names when creating the profile. A client-supplied `ownerUserId` is rejected.
A second profile creation for the same account returns `409 Conflict`.

Only the profile owner can update or delete it, or create, update and delete its service offerings.
Attempts by another authenticated user return `403 Forbidden`.
Review creation currently remains available to authenticated users; linking
reviews to completed service requests is planned.

Existing and demo profiles have no owner (`ownerUserId: null`). They remain
publicly readable, but authenticated users cannot update or delete them, or
create, update or delete offerings on them. The ownership migration preserves existing profiles,
reviews and offerings.

When reverting `AddServiceProviderOwner`, use `--transaction none` to preserve
related data. If it is the latest applied migration, run:

```bash
npm run migration:revert -- --transaction none
```

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

- Service requests and status tracking
- Reviews linked to completed service requests
