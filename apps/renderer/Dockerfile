FROM node:20

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json /app/package.json
COPY tsconfig.json /app/tsconfig.json
COPY src /app/src

RUN npm install
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]

