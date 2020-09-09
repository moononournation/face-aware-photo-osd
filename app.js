const CV = require('opencv4nodejs');
const FS = require('fs');
const HTTP = require('http');
const MOMENT = require('moment');
const PUREIMAGE = require('pureimage');
const SHARP = require('sharp');
const URL = require('url');

const DEBUGMODE = (process.env.DEBUG == "Y");

// OpenCV face detection classifier
const CLASSIFIER1 = new CV.CascadeClassifier(CV.HAAR_EYE);
// const CLASSIFIER1 = new CV.CascadeClassifier(CV.HAAR_FRONTALFACE_DEFAULT);
// const CLASSIFIER1 = new CV.CascadeClassifier(CV.HAAR_FRONTALFACE_ALT);
// const CLASSIFIER1 = new CV.CascadeClassifier(CV.HAAR_FRONTALFACE_ALT2);
// const CLASSIFIER1 = new CV.CascadeClassifier(CV.HAAR_FRONTALFACE_ALT_TREE);

// const CLASSIFIER2 = new CV.CascadeClassifier(CV.HAAR_EYE);
// const CLASSIFIER2 = new CV.CascadeClassifier(CV.HAAR_FRONTALFACE_DEFAULT);
// const CLASSIFIER2 = new CV.CascadeClassifier(CV.HAAR_FRONTALFACE_ALT);
const CLASSIFIER2 = new CV.CascadeClassifier(CV.HAAR_FRONTALFACE_ALT2);
// const CLASSIFIER2 = new CV.CascadeClassifier(CV.HAAR_FRONTALFACE_ALT_TREE);

// photos directory
const PHOTOPATH = "photo/";
const OSDUPDATEINTERVAL = (10 * 60 * 1000); // 10 minutes

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
    ctx.fillStyle = '#7f7f7f';
    ctx.fillText(text, x - 1, y - 1);
    // draw lower right border
    ctx.fillStyle = '#3f3f3f';
    ctx.fillText(text, x + 2, y + 2);
    // draw text
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // function for retrieving RSS feed display to OSD
  var osd_data;
  function update_osd() {
    if ((!osd_data) || ((Date.now() - osd_data.last_update) > OSDUPDATEINTERVAL)) {

      // You map change following script to your selected RSS feed
      if (process.env.OSD == "HK_Weather") {
        // Begin: get HK weather
        HTTP.get('http://rss.weather.gov.hk/rss/CurrentWeather.xml', (resp) => {
          let rssData = '';

          // A chunk of data has been recieved.
          resp.on('data', (chunk) => {
            rssData += chunk;
          });

          // The whole response has been received. Print out the result1.
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

            osd_data = {
              image: image,
              temperature: temperature,
              humidity: humidity,
              last_update: Date.now(),
              text: "" + temperature + "˚C  " + humidity + "%"
            };

            if (DEBUGMODE) {
              console.log("osd_data:", osd_data);
            }
          });

        }).on("error", (err) => {
          console.log("Error:", err.message);
        });
        // End: get HK weather
      }
    }
  }

  // face aware photo OSD HTTP request handler
  function photo_OSD_handler(filename, req, res) {
    if (DEBUGMODE) {
      console.log("filename:", filename);
    }

    var start_time = Date.now();

    // read photo
    const PHOTO = SHARP(filename);
    PHOTO.raw().toBuffer(function (err, buf, info) {
      if (!info) {
        res.end();
        console.log("invalid file:", filename);
        return;
      }
      const W = info.width;
      const H = info.height;

      // create OpenCV Mat object from photo buffer
      const IMG = new CV.Mat(buf, H, W, CV.CV_8UC3);
      // console.log("IMG:", IMG);
      if (DEBUGMODE) {
        console.log("load photo used:", Date.now() - start_time);
        start_time = Date.now();
      }

      // OpenCV face detect
      CLASSIFIER1.detectMultiScaleAsync(IMG.bgrToGray(), (err, result1) => {
        if (DEBUGMODE) {
          console.log("result1:", result1);
          console.log("CLASSIFIER1 used:", Date.now() - start_time);
          start_time = Date.now();
        }
        CLASSIFIER2.detectMultiScaleAsync(IMG.bgrToGray(), (err, result2) => {
          if (DEBUGMODE) {
            console.log("result2:", result2);
            console.log("CLASSIFIER2 used:", Date.now() - start_time);
            start_time = Date.now();
          }

          // calculate output dimension
          var cropW = W, cropH = H, dx = 0, dy = 0, outW = W, outH = H, scale = 1;
          const URLPARSE = URL.parse(req.url, true);
          // console.log("URLPARSE:", URLPARSE);

          if (URLPARSE.query) {
            if (URLPARSE.query.w) {
              outW = parseInt(URLPARSE.query.w);
              scale = outW / W;
              if (URLPARSE.query.h) {
                outH = parseInt(URLPARSE.query.h);
                if ((outW / outH) > (W / H)) {
                  cropH = Math.round(W * outH / outW);
                  dy = Math.round((H - cropH) / 2);
                  var top = H, bottom = 0;
                  if (dy && result1) {
                    result1.objects.forEach((rect) => {
                      if (top > rect.y) {
                        top = rect.y;
                      }
                      if (bottom < (rect.y + rect.height - 1)) {
                        bottom = rect.y + rect.height - 1;
                      }
                    });
                    if (result2) {
                      result2.objects.forEach((rect) => {
                        if (top > rect.y) {
                          top = rect.y;
                        }
                        if (bottom < (rect.y + rect.height - 1)) {
                          bottom = rect.y + rect.height - 1;
                        }
                      });
                    }
                    if (DEBUGMODE) {
                      console.log("top:", top, "bottom:", bottom);
                    }
                    if (dy > top) {
                      if (dy < (bottom - cropH + 1)) {
                        var i = -1;
                        var certainty;
                        var tcb_overlap = 0;
                        var bcb_overlap = 0;
                        const TOPCROPBORDER = { top: 0, bottom: dy, left: 0, right: W - 1 };
                        // console.log("TOPCROPBORDER:", TOPCROPBORDER);
                        const BOTTOMCROPBORDER = { top: dy + cropH, bottom: H - 1, left: 0, right: W - 1 };
                        // console.log("BOTTOMCROPBORDER:", BOTTOMCROPBORDER);
                        if (result1) {
                          result1.objects.forEach((rect) => {
                            certainty = result1.numDetections[++i];
                            tcb_overlap += overlap_area(TOPCROPBORDER, rect) * certainty;
                            bcb_overlap += overlap_area(BOTTOMCROPBORDER, rect) * certainty;
                          });
                        }
                        if (result2) {
                          i = -1;
                          result2.objects.forEach((rect) => {
                            certainty = result2.numDetections[++i] * 10;
                            tcb_overlap += overlap_area(TOPCROPBORDER, rect) * certainty;
                            bcb_overlap += overlap_area(BOTTOMCROPBORDER, rect) * certainty;
                          });
                        }
                        if (DEBUGMODE) {
                          console.log("tcb_overlap:", tcb_overlap, "bcb_overlap:", bcb_overlap);
                        }
                        if (tcb_overlap > bcb_overlap) {
                          dy = top;
                        } else {
                          dy = bottom - cropH + 1;
                        }
                      } else {
                        dy = top;
                      }
                    } else if (dy < (bottom - cropH + 1)) {
                      dy = bottom - cropH + 1;
                    }
                  }
                } else {
                  cropW = Math.round(H * outW / outH);
                  dx = Math.round((W - cropW) / 2);
                  var left = W, right = 0;
                  if (dx && result1) {
                    result1.objects.forEach((rect) => {
                      if (left > rect.x) {
                        left = rect.x;
                      }
                      if (right < (rect.x + rect.width - 1)) {
                        right = rect.x + rect.width - 1;
                      }
                    });
                    if (result2) {
                      result2.objects.forEach((rect) => {
                        if (left > rect.x) {
                          left = rect.x;
                        }
                        if (right < (rect.x + rect.width - 1)) {
                          right = rect.x + rect.width - 1;
                        }
                      });
                    }
                    if (DEBUGMODE) {
                      console.log("left:", left, "right:", right);
                    }
                    if (dx > left) {
                      if (dx < (right - cropW + 1)) {
                        var i = -1;
                        var certainty;
                        var lcb_overlap = 0;
                        var rcb_overlap = 0;
                        const LEFTCROPBORDER = { top: 0, bottom: H - 1, left: 0, right: dx };
                        // console.log("LEFTCROPBORDER:", LEFTCROPBORDER);
                        const RIGHTCROPBORDER = { top: 0, bottom: H - 1, left: dx + cropW, right: W - 1 };
                        // console.log("RIGHTCROPBORDER:", RIGHTCROPBORDER);
                        if (result1) {
                          result1.objects.forEach((rect) => {
                            certainty = result1.numDetections[++i];
                            lcb_overlap += overlap_area(LEFTCROPBORDER, rect) * certainty;
                            rcb_overlap += overlap_area(RIGHTCROPBORDER, rect) * certainty;
                          });
                        }
                        if (result2) {
                          i = -1;
                          result2.objects.forEach((rect) => {
                            certainty = result2.numDetections[++i] * 10;
                            lcb_overlap += overlap_area(LEFTCROPBORDER, rect) * certainty;
                            rcb_overlap += overlap_area(RIGHTCROPBORDER, rect) * certainty;
                          });
                        }
                        if (DEBUGMODE) {
                          console.log("lcb_overlap:", lcb_overlap, "rcb_overlap:", bcb_overlap);
                        }
                        if (lcb_overlap > rcb_overlap) {
                          dx = left;
                        } else {
                          dx = right - cropW + 1;
                        }
                      } else {
                        dx = left;
                      }
                    } else if (dx < (right - cropW + 1)) {
                      dx = right - cropW + 1;
                    }
                  }
                }
                if (DEBUGMODE) {
                  console.log("dx:", dx, "dy:", dy, "cropW:", cropW, "cropH:", cropH, "outW", outW, "outH", outH);
                }
              } else {
                outH = Math.round(H * scale);
              }
            } else if (URLPARSE.query.h) {
              outH = parseInt(URLPARSE.query.h);
              scale = outH / H;
              outW = Math.round(W * scale);
            }
          }

          // calculate 4 corners OSD range
          const OSDHEIGHT = Math.round(Math.min(cropW, cropH) * 0.55);
          // console.log("OSDHEIGHT:", OSDHEIGHT);
          const OSDWIDTH = Math.round(Math.min(cropW, cropH) * 0.65);
          // console.log("OSDWIDTH:", OSDWIDTH);
          const UPPERLEFT = { top: dy + 1, bottom: dy + OSDHEIGHT, left: dx + 1, right: dx + OSDWIDTH }
          // console.log("UPPERLEFT:", UPPERLEFT);
          const UPPERRIGHT = { top: dy + 1, bottom: dy + OSDHEIGHT, left: dx + cropW - OSDWIDTH + 1, right: dx + cropW }
          // console.log("UPPERRIGHT:", UPPERRIGHT);
          const LOWERLEFT = { top: dy + cropH - OSDHEIGHT + 1, bottom: dy + cropH, left: dx + 1, right: dx + OSDWIDTH }
          // console.log("LOWERLEFT:", LOWERLEFT);
          const LOWERRIGHT = { top: dy + cropH - OSDHEIGHT + 1, bottom: dy + cropH, left: dx + cropW - OSDWIDTH + 1, right: dx + cropW }
          // console.log("LOWERRIGHT:", LOWERRIGHT);

          // determine font scale
          const FONTSCALE = Math.min(outW, outH) / 1200;
          if (DEBUGMODE) {
            console.log("FONTSCALE:", FONTSCALE);
          }

          // determine OSD position by least face overlapping area
          var i = -1;
          var certainty;
          var ul_overlap = 0;
          var ur_overlap = 0;
          var ll_overlap = 0;
          var lr_overlap = 0;

          if (result1) {
            result1.objects.forEach((rect) => {
              certainty = result1.numDetections[++i];
              ul_overlap += overlap_area(UPPERLEFT, rect) * certainty;
              ur_overlap += overlap_area(UPPERRIGHT, rect) * certainty;
              ll_overlap += overlap_area(LOWERLEFT, rect) * certainty;
              lr_overlap += overlap_area(LOWERRIGHT, rect) * certainty;
            });
          }
          if (result2) {
            i = -1;
            result2.objects.forEach((rect) => {
              certainty = result2.numDetections[++i] * 10;
              ul_overlap += overlap_area(UPPERLEFT, rect) * certainty;
              ur_overlap += overlap_area(UPPERRIGHT, rect) * certainty;
              ll_overlap += overlap_area(LOWERLEFT, rect) * certainty;
              lr_overlap += overlap_area(LOWERRIGHT, rect) * certainty;
            });
          }
          if (DEBUGMODE) {
            console.log("ul_overlap:", ul_overlap, "ur_overlap:", ur_overlap, "ll_overlap:", ll_overlap, "lr_overlap:", lr_overlap);
          }

          var min_overlap = Math.min(Math.min(ul_overlap, ur_overlap), Math.min(ll_overlap, lr_overlap));
          var osd_x, osd_y;
          if (ll_overlap == min_overlap) {
            osd_x = Math.round(FONTSCALE * 50);
            osd_y = outH - Math.round(FONTSCALE * 500);
          } else if (lr_overlap == min_overlap) {
            osd_x = outW - Math.round(FONTSCALE * 600);
            osd_y = outH - Math.round(FONTSCALE * 500);
          } else if (ul_overlap == min_overlap) {
            osd_x = Math.round(FONTSCALE * 50);
            osd_y = Math.round(FONTSCALE * 50);
          } else /* (ur_overlap == min_overlap) */ {
            osd_x = outW - Math.round(FONTSCALE * 600);
            osd_y = Math.round(FONTSCALE * 50);
          }

          if (DEBUGMODE) {
            console.log("determine OSD position used:", Date.now() - start_time);
            start_time = Date.now();
          }

          // crop and resize photo
          PHOTO.extract({ left: dx, top: dy, width: cropW, height: cropH })
            .resize(outW, outH)
            .raw()
            .toBuffer(function (err, buf, info) {
              if (DEBUGMODE) {
                console.log("resize used:", Date.now() - start_time);
                start_time = Date.now();
              }

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
              if (DEBUGMODE) {
                console.log("getContext used:", Date.now() - start_time);
                start_time = Date.now();
              }

              const TEXT1 = MOMENT().format('HH:mm');
              const TEXT2 = MOMENT().format('MMM DD, ddd');

              // draw OSD
              ctx.font = (FONTSCALE * 232) + "pt 'FreeSansBold'";
              var size = ctx.measureText(TEXT1);
              // console.log("size:", size);
              osd_y += Math.round(size.emHeightAscent);
              draw_text_with_border(ctx, TEXT1, osd_x, osd_y, "#ffffff");
              osd_y += Math.round(FONTSCALE * 10);
              ctx.font = (FONTSCALE * 96) + "pt 'FreeSansBold'";
              size = ctx.measureText(TEXT2);
              // console.log("size:", size);
              osd_y += Math.round(size.emHeightAscent);
              draw_text_with_border(ctx, TEXT2, osd_x, osd_y, "#ffffff");
              if (osd_data) {
                var text3 = osd_data.text;
                osd_y += Math.round(FONTSCALE * 30);
                ctx.font = (FONTSCALE * 120) + "pt 'FreeSansBold'";
                size = ctx.measureText(text3);
                // console.log("size:", size);
                osd_y += Math.round(size.emHeightAscent);
                draw_text_with_border(ctx, text3, osd_x, osd_y, "#ffffff");
              }
              if (DEBUGMODE) {
                console.log("draw OSD used:", Date.now() - start_time);
                start_time = Date.now();
              }

              if (DEBUGMODE) {
                if (result1) {
                  result1.objects.forEach((rect) => {
                    ctx.strokeStyle = 'red';
                    ctx.strokeRect(
                      Math.round((rect.x - dx) * scale),
                      Math.round((rect.y - dy) * scale),
                      Math.round(rect.width * scale),
                      Math.round(rect.height * scale)
                    );
                  });
                }

                if (result2) {
                  result2.objects.forEach((rect) => {
                    ctx.strokeStyle = 'white';
                    ctx.strokeRect(
                      Math.round((rect.x - dx) * scale),
                      Math.round((rect.y - dy) * scale),
                      Math.round(rect.width * scale),
                      Math.round(rect.height * scale)
                    );
                  });
                }
              }

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
                  quality: 94,
                  // chromaSubsampling: '4:4:4'
                })
                .toBuffer()
                .then(data => {
                  if (DEBUGMODE) {
                    console.log("encode to JPEG used:", Date.now() - start_time);
                    start_time = Date.now();
                  }

                  res.setHeader('Content-Type', 'image/jpeg');
                  res.setHeader('Content-Length', data.length);
                  res.write(data);
                  res.end();
                  if (DEBUGMODE) {
                    console.log("write to HTTP response used:", Date.now() - start_time);
                  }
                });
            });
        });
      });
    });
  }

  /* web server 3002 */
  //create a server object:
  HTTP.createServer(function (req, res) {
    if (req.url == "/favicon.ico") {
      res.end();
    } else if (req.url == "/") {
      res.setHeader('Content-Type', 'text/html');
      res.write(
        `<html>
<head>
<style type="text/css">body{margin:0;}</style>
<script>
function p(){document.getElementById("photo").src="/?w="+window.innerWidth+"&h="+window.innerHeight+"&t="+Date.now();}
window.onload=function(){p();setInterval(p,60000);};
</script>
</head>
<body><img id="photo"><body>
</html>`);
      res.end();
    } else {
      update_osd();

      FS.readdir(PHOTOPATH, function (err, files) {
        var filename;
        do {
          filename = PHOTOPATH + files[Math.floor(Math.random() * files.length)];
        } while (!filename.toUpperCase().endsWith(".JPG"))
        photo_OSD_handler(filename, req, res);
      });
    }
  }).listen(8080, (err) => {
    if (err) {
      return console.log("something bad happened", err)
    }
    console.log("listen to port 8080...");
  });

});
