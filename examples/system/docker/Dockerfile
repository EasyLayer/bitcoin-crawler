FROM node:20-alpine

RUN corepack enable

ENV NODE_ENV=development

WORKDIR /app

COPY package.json tsconfig.json ./
RUN yarn install

COPY src ./src
RUN mkdir -p /app/eventstore

EXPOSE 3000

CMD ["yarn", "start"]
