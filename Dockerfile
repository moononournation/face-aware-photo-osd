# build command
#docker build -t moononournation/face-aware-photo-osd:1.0.1 .
# push command
# docker image push moononournation/face-aware-photo-osd:1.0.1

#building Multi-Arch Images commands
#docker buildx ls
#docker buildx create --use
#docker buildx build --platform linux/amd64,linux/arm -t moononournation/face-aware-photo-osd:1.0.1 .
#docker buildx build --platform linux/amd64,linux/arm -t moononournation/face-aware-photo-osd:1.0.1 --push .

# run command
#docker run -it -p 8080:8080 -e TZ=Asia/Hong_Kong -e OSD=HK_Weather -v /path/to/photo:/app/photo -v /path/to/app.js:/app/app.js moononournation/face-aware-photo-osd:1.0.1

FROM node:10-buster-slim

EXPOSE 8080

WORKDIR /app

RUN npm i -g npm \
    && apt-get update \
    && apt-get upgrade -y

RUN apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      cmake \
      git \
      python

COPY package*.json ./

RUN npm install --save opencv4nodejs@latest

RUN npm install

RUN npm install -g node-dev

RUN npm cache clean --force \
    && apt-get remove -y \
      build-essential \
      ca-certificates \
      cmake \
      git \
      python \
    && apt-get autoremove -y \
    && rm -r /var/lib/apt/lists/*

COPY font ./font/

COPY app.js .

CMD [ "node-dev", "app.js" ]
