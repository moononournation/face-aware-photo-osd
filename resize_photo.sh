#!/bin/sh

mkdir -p photo
find *.jpg -exec convert {} -auto-level -level 0%,100%,1.6 -modulate 100,115 -resize 1024x600^ -gravity center -extent 1024x600 -quality 94 -strip photo/{} \;
