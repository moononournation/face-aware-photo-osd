#!/bin/sh

mkdir -p photo
mogrify -format jpg *.heic
find ./ -type f -iname \*.jpg -exec convert {} -auto-orient -auto-level -level 0%,100%,1.4 -modulate 100,115 -resize 1600x1200^ -gravity center -extent 1600x1200 -quality 94 -strip photo/{} \;
