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

## Project status

The application is under active development.
Authentication, user accounts and service request workflows are planned.
The current version is intended for local development and demonstration.

## Requirements

- Node.js 26
- npm

## Local setup

Run these commands from the project directory:

```bash
npm ci
cp .env.example .env
npm run migration:run
npm run start:dev
```

For an existing installation, keep your current `.env` file.

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

Service providers can be created through Swagger UI or the Angular frontend.

## Demo data

To populate an empty local database with 12 fictional service providers,
7 reviews and 14 service offerings, configure your `.env` file, then run:

```bash
npm run build
npm run migration:run:prod
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
```

Then install, build, migrate, and start the application in this order:

```bash
npm ci
npm run build
npm run migration:run:prod
npm run start:prod
```

Database migrations are executed as a separate deployment step before the application starts.

## Quality checks

```bash
npm run format:check
npm run lint
npm run build
npm test
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

- Authentication and user accounts
- Service requests and status tracking
- Reviews linked to completed service requests
