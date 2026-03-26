FROM node:20

WORKDIR /app

COPY package.json /app/package.json

COPY tsconfig.json /app/tsconfig.json
COPY src /app/src

RUN npm install
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]

