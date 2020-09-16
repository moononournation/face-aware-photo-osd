# build command
#docker build -t moononournation/face-aware-photo-osd:1.0.2 .
# push command
# docker image push moononournation/face-aware-photo-osd:1.0.2

#building Multi-Arch Images commands
#docker buildx ls
#docker buildx create --use
#docker buildx build --platform linux/amd64,linux/arm -t moononournation/face-aware-photo-osd:1.0.2 .
#docker buildx build --platform linux/amd64,linux/arm -t moononournation/face-aware-photo-osd:1.0.2 --push .

# run command
#docker run -it -p 8080:8080 -e TZ=Asia/Hong_Kong -e OSD=HK_Weather -v /path/to/photo:/app/photo -v /path/to/app.js:/app/app.js moononournation/face-aware-photo-osd:1.0.2

# run command in debug mode
#docker run -it -p 8080:8080 -e TZ=Asia/Hong_Kong -e OSD=HK_Weather -e DEBUG=Y -v /path/to/photo:/app/photo -v /path/to/app.js:/app/app.js moononournation/face-aware-photo-osd:1.0.2

FROM node:10-buster-slim

EXPOSE 8080

WORKDIR /app

COPY package*.json ./

RUN npm install -g npm \
    && npm install -g node-dev \
    && apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      cmake \
      git \
      python \
    && npm install \
    && npm cache clean --force \
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
