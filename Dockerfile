# build command
#docker build -t face-aware-photo-osd:1.0.0 .
# push command
#docker image tag face-aware-photo-osd:1.0.0 moononournation/face-aware-photo-osd:1.0.0
#docker image push moononournation/face-aware-photo-osd:1.0.0
# run command
#docker run -it -p 8080:8080 -e TZ=Asia/Hong_Kong -v /path/to/photo960:/usr/src/app/photo960 moononournation/face-aware-photo-osd:1.0.0

FROM node:8

WORKDIR /usr/src/app

RUN npm i -g npm \
    && npm install nodemon -g \
    && apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
		build-essential \
        cmake \
        libopenblas-dev

COPY package*.json ./

RUN npm install \
    && npm cache clean --force \
    && apt-get remove -y \
		    build-essential \
        cmake \
    && apt-get autoremove -y \
    && rm -r /var/lib/apt/lists/*

COPY . .

EXPOSE 8080

CMD [ "nodemon", "app.js" ]
