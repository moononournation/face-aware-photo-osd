#!/bin/sh

mkdir -p photo
mogrify -format jpg *.heic
find ./ -type f -iname \*.jpg -exec convert {} -auto-orient -auto-level -level 0%,100%,1.2 -modulate 100,115 -resize 1920x1920 -quality 94 -strip photo/{} \;
