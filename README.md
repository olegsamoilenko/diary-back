<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# full Jest gate (requires the PostgreSQL and Redis fixtures listed below)
$ npm run test:ci

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

GitHub Actions runs `npm run verify` (typecheck, ESLint, Jest and build) on pushes and on pull requests targeting `main`. Production deployment requires the check to pass for the exact `main` commit. The event-policy parity test reads `../diary-front/logging/eventPolicy.ts`. When the frontend repository is private, supply the Actions secret `DIARY_FRONT_READ_TOKEN` with read-only contents access to that repository.

The CI suite runs in a single Jest process and stops on the first failing suite. This avoids Jest 29's 500 ms shutdown deadline for forked test workers. To trace an open resource if Jest hangs, run `npm run test:ci -- --detectOpenHandles` or `npm test -- --runInBand --detectOpenHandles`.

The test job starts a fresh PostgreSQL 16 and Redis 7 on each runner, waits for both health checks, then passes the PostgreSQL container ID and Redis host port to Jest. A skipped suite, skipped test or todo fails the deployment gate and prints the affected file paths. Ordinary `npm test` remains available for focused development runs.

For a local full run, start disposable containers and run these commands in PowerShell from `diary-back`. The PostgreSQL fixtures expect Docker access, a published port, and the three `POSTGRES_*` values shown here.

```powershell
docker run -d --rm --name nemory-test-pg -p 127.0.0.1::5432 -e POSTGRES_USER=qa -e POSTGRES_DB=postgres -e POSTGRES_PASSWORD=local-test-only postgres:16
docker run -d --rm --name nemory-test-redis -p 127.0.0.1::6379 redis:7-alpine
docker exec nemory-test-pg pg_isready -h 127.0.0.1 -U qa -d postgres
docker exec nemory-test-redis redis-cli ping

# Once PostgreSQL reports "accepting connections" and Redis reports "PONG":
foreach ($name in 'NA15_POSTGRES_CONTAINER','NA34_POSTGRES_CONTAINER','NA59_POSTGRES_CONTAINER','NA64_POSTGRES_CONTAINER','ADMIN_GROWTH_POSTGRES_CONTAINER','PURCHASE_NOTIFICATIONS_POSTGRES_CONTAINER') {
  Set-Item "Env:$name" 'nemory-test-pg'
}
$env:NA47_REDIS_PORT = (docker port nemory-test-redis 6379/tcp).Split(':')[-1]
npm run verify
```

After checking the exit status, remove both disposable containers:

```powershell
docker stop nemory-test-pg nemory-test-redis
```

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
