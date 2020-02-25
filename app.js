const CV = require('opencv4nodejs');
const FS = require('fs');
const HTTP = require('http');
const MOMENT = require('moment');
const PUREIMAGE = require('pureimage');
const SHARP = require('sharp');
const URL = require('url');

// OpenCV face detection classifier
const CLASSIFIER = new CV.CascadeClassifier(CV.HAAR_FRONTALFACE_ALT2);

// photos directory
const PHOTOPATH = "photo/";

// preload TTF font file
PUREIMAGE.registerFont('font/FreeSansBold.ttf', 'FreeSansBold').load(() => {

  // function for calculate area overlapping face
  function overlap_area(range, rect) {
    var overlap_range = {
      left: Math.max(range.left, rect.x),
      right: Math.min(range.right, rect.x + rect.width - 1),
      top: Math.max(range.top, rect.y),
      bottom: Math.min(range.bottom, rect.y + rect.height - 1)
    }
    if ((overlap_range.right >= overlap_range.left) && (overlap_range.bottom >= overlap_range.top)) {
      return (overlap_range.right - overlap_range.left + 1) * (overlap_range.bottom - overlap_range.top + 1);
    } else {
      return 0; // no overlap
    }
  }

  // function for drawing text that can readable on any color background
  function draw_text_with_border(ctx, text, x, y, color) {
    // draw upper left border
    ctx.fillStyle = '#bfbfbf';
    ctx.fillText(text, x - 1, y - 1);
    // draw lower right border
    ctx.fillStyle = '#3f3f3f';
    ctx.fillText(text, x + 1, y + 1);
    // draw text
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // function for retrieving most recent weather RSS feed
  var currentWeather;
  function update_weather() {
    if ((!currentWeather) || ((Date.now() - currentWeather.last_update) > (10 * 60 * 1000))) {

      // You should change following script to your local weather RSS feed
      // Begin: get HK weather
      HTTP.get('http://rss.weather.gov.hk/rss/CurrentWeather.xml', (resp) => {
        let rssData = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
          rssData += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
          // console.log("rssData:", rssData);

          let key = "<img src=\"";
          let start_idx = rssData.search(key) + key.length;
          let end_idx = rssData.indexOf("\"", start_idx);
          let image = rssData.substring(start_idx, end_idx);
          key = "Air temperature : ";
          start_idx = rssData.search(key) + key.length;
          end_idx = rssData.indexOf(" ", start_idx);
          let temperature = parseInt(rssData.substring(start_idx, end_idx));
          key = "Relative Humidity : ";
          start_idx = rssData.search(key) + key.length;
          end_idx = rssData.indexOf(" ", start_idx);
          let humidity = parseInt(rssData.substring(start_idx, end_idx));

          currentWeather = {
            image: image,
            temperature: temperature,
            humidity: humidity,
            last_update: Date.now()
          };

          console.log("currentWeather:", currentWeather);
        });
        // End: get HK weather

      }).on("error", (err) => {
        console.log("Error:", err.message);
      });
    }
  }

  // face aware photo OSD HTTP request handler
  function photo_OSD_handler(filename, req, res) {
    var start_time = Date.now();

    // read photo
    const PHOTO = SHARP(filename);
    PHOTO.raw().toBuffer(function (err, buf, info) {
      const W = info.width;
      const H = info.height;

      // create OpenCV Mat object from photo buffer
      const IMG = new CV.Mat(buf, H, W, CV.CV_8UC3);
      // console.log("IMG:", IMG);

      // OpenCV face detect
      CLASSIFIER.detectMultiScaleAsync(IMG.bgrToGray(), (err, result) => {
        console.log("result:", result);
        console.log("detector used:", Date.now() - start_time);
        start_time = Date.now();

        // calculate output dimension
        var cropW = W, cropH = H, dx = 0, dy = 0, outW = W, outH = H;
        const URLPARSE = URL.parse(req.url, true);
        // console.log("URLPARSE:", URLPARSE);
        if (URLPARSE.query) {
          if (URLPARSE.query.w) {
            outW = parseInt(URLPARSE.query.w);
            if (URLPARSE.query.h) {
              outH = parseInt(URLPARSE.query.h);
              if ((outW / outH) > (W / H)) {
                cropH = Math.round(W * outH / outW);
                dy = Math.round((H - cropH) / 2);
                result.objects.forEach((rect) => {
                  if (rect.y < dy) {
                    dy = rect.y;
                  }
                });
              } else {
                cropW = Math.round(H * outW / outH);
                dx = Math.round((W - cropW) / 2);
                result.objects.forEach((rect) => {
                  if (rect.x < dx) {
                    dx = rect.x;
                  }
                });
              }
              // console.log("dx:", dx, "dy:", dy, "cropW:", cropW, "cropH:", cropH, "outW", outW, "outH", outH);
            } else {
              outH = Math.round(outW * H / W);
            }
          } else if (URLPARSE.query.h) {
            outH = parseInt(URLPARSE.query.h);
            outW = Math.round(outH * W / H);
          }
        }

        // determine font scale
        const FONTSCALE = Math.min(outW, outH) / 240;
        // console.log("FONTSCALE:", FONTSCALE);
        
        // calculate 4 corners OSD range
        const OSDSQUARESIZE = Math.round(Math.min(cropW, cropH) / 2);
        // console.log("OSDSQUARESIZE:", OSDSQUARESIZE);
        const UPPERLEFT = { top: dy + 1, bottom: dy + OSDSQUARESIZE, left: dx + 1, right: dx + OSDSQUARESIZE }
        // console.log("UPPERLEFT:", UPPERLEFT);
        const UPPERRIGHT = { top: dy + 1, bottom: dy + OSDSQUARESIZE, left: dx + cropW - OSDSQUARESIZE + 1, right: dx + cropW }
        // console.log("UPPERRIGHT:", UPPERRIGHT);
        const LOWERLEFT = { top: dy + cropH - OSDSQUARESIZE + 1, bottom: dy + cropH, left: dx + 1, right: dx + OSDSQUARESIZE }
        // console.log("LOWERLEFT:", LOWERLEFT);
        const LOWERRIGHT = { top: dy + cropH - OSDSQUARESIZE + 1, bottom: dy + cropH, left: dx + cropW - OSDSQUARESIZE + 1, right: dx + cropW }
        // console.log("LOWERRIGHT:", LOWERRIGHT);

        // determine OSD position by least face overlapping area
        var ul_overlap = 0;
        var ur_overlap = 0;
        var ll_overlap = 0;
        var lr_overlap = 0;

        result.objects.forEach((rect) => {
          ul_overlap += overlap_area(UPPERLEFT, rect);
          ur_overlap += overlap_area(UPPERRIGHT, rect);
          ll_overlap += overlap_area(LOWERLEFT, rect);
          lr_overlap += overlap_area(LOWERRIGHT, rect);
        });

        var min_overlap = Math.min(Math.min(ul_overlap, ur_overlap), Math.min(ll_overlap, lr_overlap));
        var osd_size = Math.round(FONTSCALE * 120);
        var osd_offset;
        if (ll_overlap == min_overlap) {
          osd_offset = { x: 0, y: outH - 1 - osd_size };
        } else if (lr_overlap == min_overlap) {
          osd_offset = { x: outW - 1 - osd_size, y: outH - 1 - osd_size };
        } else if (ul_overlap == min_overlap) {
          osd_offset = { x: 0, y: 0 };
        } else /* (ur_overlap == min_overlap) */ {
          osd_offset = { x: outW - 1 - osd_size, y: 0 };
        }
        // console.log("osd_offset:", osd_offset);

        console.log("determine OSD position used:", Date.now() - start_time);
        start_time = Date.now();

        // crop and resize photo
        PHOTO.extract({ left: dx, top: dy, width: cropW, height: cropH })
          .resize(outW, outH)
          .raw()
          .toBuffer(function (err, buf, info) {
            console.log("resize used:", Date.now() - start_time);
            start_time = Date.now();

            // copy image buffer to pureimage context
            var img = PUREIMAGE.make(outW, outH);
            var n = -1, o = -1;
            for (var y = 0; y < outH; ++y) {
              for (var x = 0; x < outW; ++x) {
                img.data[++o] = buf[++n]; // R
                img.data[++o] = buf[++n]; // G
                img.data[++o] = buf[++n]; // B
                img.data[++o] = 255; // A
              }
            }
            var ctx = img.getContext('2d');
            console.log("getContext used:", Date.now() - start_time);
            start_time = Date.now();

            const TEXT1 = MOMENT().format('HH:mm');
            const TEXT2 = MOMENT().format('MMM DD, ddd');

            // draw OSD
            var x = osd_offset.x + Math.round(FONTSCALE * 10);
            var y = osd_offset.y + Math.round(FONTSCALE * 10);
            ctx.font = (FONTSCALE * 40) + "pt 'FreeSansBold'";
            var size = ctx.measureText(TEXT1);
            // console.log("size:", size);
            y += size.emHeightAscent;
            draw_text_with_border(ctx, TEXT1, x, y, "#ffffff");
            y += Math.round(FONTSCALE * 8);
            ctx.font = (FONTSCALE * 18) + "pt 'FreeSansBold'";
            size = ctx.measureText(TEXT2);
            // console.log("size:", size);
            y += size.emHeightAscent;
            draw_text_with_border(ctx, TEXT2, x, y, "#ffffff");
            if (currentWeather) {
              var text3 = "" + currentWeather.temperature + "˚C  " + currentWeather.humidity + "%";
              y += Math.round(FONTSCALE * 16);
              ctx.font = (FONTSCALE * 21) + "pt 'FreeSansBold'";
              size = ctx.measureText(text3);
              // console.log("size:", size);
              y += size.emHeightAscent;
              draw_text_with_border(ctx, text3, x, y, "#ffffff");
            }
            console.log("draw OSD used:", Date.now() - start_time);
            start_time = Date.now();

            // encode to JPEG and write to HTTP response
            SHARP(img.data,
              {
                raw: {
                  width: outW,
                  height: outH,
                  channels: 4
                }
              })
              .jpeg({
                quality: 75,
                chromaSubsampling: '4:4:4'
              })
              .toBuffer()
              .then(data => {
                console.log("encode to JPEG used:", Date.now() - start_time);
                start_time = Date.now();

                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Content-Length', data.length);
                res.write(data);
                res.end();
                console.log("write to HTTP response used:", Date.now() - start_time);
              });
          });
      });
    });
  }

  /* web server 3002 */
  //create a server object:
  HTTP.createServer(function (req, res) {
    update_weather();

    FS.readdir(PHOTOPATH, function (err, files) {
      var filename = PHOTOPATH + files[Math.floor(Math.random() * files.length)];
      photo_OSD_handler(filename, req, res);
    });
  }).listen(8080, (err) => {
    if (err) {
      return console.log("something bad happened", err)
    }
    console.log("listen to port 8080...");
  });

});
