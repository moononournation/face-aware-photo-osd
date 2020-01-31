#!/bin/sh

mkdir -p photo1280
cd photo
#find * -exec convert {} -auto-level -normalize -level 0%,100%,1.1 -modulate 100,110 -resize 1280x960^ -gravity center -extent 1280x960 -quality 94 -strip ../photo1280/{} \;
#find * -exec convert {} -resize 1280x960^ -gravity center -extent 1280x960 -quality 94 -strip ../photo1280/{} \;

#find *.jpg -exec convert {} -auto-level -level 0%,100%,1.6 -modulate 100,115 -resize 960x640^ -gravity center -extent 960x640 -quality 94 -strip photo960/{} \;
find *.jpg -exec convert {} -auto-level -level 0%,100%,1.6 -modulate 100,115 -resize 1280x960^ -gravity center -extent 1280x960 -quality 94 -strip photo1280/{} \;
