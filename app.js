const FACEDETECTION = require('face-detection');
const FS = require('fs');
const HTTP = require('http');
const MOMENT = require('moment');
const PUREIMAGE = require('pureimage');
const SHARP = require('sharp');
const URL = require('url');

const PHOTOPATH = "photo/";

var currentWeather;

function overlap_area(range, rect) {
  var overlap_range = {
    left: Math.max(range.left, rect.x),
    right: Math.min(range.right, rect.x + rect.width - 1),
    top: Math.max(range.top, rect.y),
    bottom: Math.min(range.bottom, rect.y + rect.height - 1)
  }
  if ((overlap_range.right > overlap_range.left) && (overlap_range.bottom > overlap_range.top)) {
    return (overlap_range.right - overlap_range.left + 1) * (overlap_range.bottom - overlap_range.top + 1);
  } else {
    return 0;
  }
}

function draw_shadow_text(ctx, text, x, y, color) {
  ctx.fillStyle = '#7f7f7f';
  ctx.fillText(text, x - 1, y - 1);
  ctx.fillStyle = '#3f3f3f';
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillText(text, x + 3, y + 3);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function update_weather() {
  if ((!currentWeather) || ((Date.now() - currentWeather.last_update) > (10 * 60 * 1000))) {
    HTTP.get('http://rss.weather.gov.hk/rss/CurrentWeather.xml', (resp) => {
      let data = '';

      // A chunk of data has been recieved.
      resp.on('data', (chunk) => {
        data += chunk;
      });

      // The whole response has been received. Print out the result.
      resp.on('end', () => {
        // console.log(data);

        let key = "<img src=\"";
        let start_idx = data.search(key) + key.length;
        let end_idx = data.indexOf("\"", start_idx);
        let image = data.substring(start_idx, end_idx);
        key = "Air temperature : ";
        start_idx = data.search(key) + key.length;
        end_idx = data.indexOf(" ", start_idx);
        let temperature = parseInt(data.substring(start_idx, end_idx));
        key = "Relative Humidity : ";
        start_idx = data.search(key) + key.length;
        end_idx = data.indexOf(" ", start_idx);
        let humidity = parseInt(data.substring(start_idx, end_idx));

        currentWeather = {
          image: image,
          temperature: temperature,
          humidity: humidity,
          last_update: Date.now()
        };

        console.log(currentWeather);
      });

    }).on("error", (err) => {
      console.log("Error: " + err.message);
    });
  }
}

async function face_detection(filename, req, res) {
  const detector = new FACEDETECTION(filename);
  const IMG = await detector.readImg(); // this will return a cvImgObject
  const RESULT = await detector.detect(IMG);
  console.log(RESULT);

  PUREIMAGE.registerFont('font/FreeSansBold.ttf', 'FreeSansBold').load(() => {
    PUREIMAGE.decodeJPEGFromStream(FS.createReadStream(filename))
      .then((frame) => {
        // console.log(frame);
        const W = frame.width;
        const H = frame.height;
        const UPPERLEFT = { top: 1, bottom: (H / 2), left: 1, right: (W / 2) }
        const UPPERRIGHT = { top: 1, bottom: (H / 2), left: (W / 2) + 1, right: W }
        const LOWERLEFT = { top: (H / 2) + 1, bottom: H, left: 1, right: (W / 2) }
        const LOWERRIGHT = { top: (H / 2) + 1, bottom: H, left: (W / 2) + 1, right: W }
    
        var ul_overlap = 0;
        var ur_overlap = 0;
        var ll_overlap = 0;
        var lr_overlap = 0;
      
        RESULT.objects.forEach((rect) => {
          // console.log(rect.width);
          ul_overlap += overlap_area(UPPERLEFT, rect);
          ur_overlap += overlap_area(UPPERRIGHT, rect);
          ll_overlap += overlap_area(LOWERLEFT, rect);
          lr_overlap += overlap_area(LOWERRIGHT, rect);
        });
        var min_overlap = Math.min(Math.min(ul_overlap, ur_overlap), Math.min(ll_overlap, lr_overlap));
        var display_rect;
        if (ll_overlap == min_overlap) {
          display_rect = LOWERLEFT;
        } else if (lr_overlap == min_overlap) {
          display_rect = LOWERRIGHT;
        } else if (ul_overlap == min_overlap) {
          display_rect = UPPERLEFT;
        } else {
          display_rect = UPPERRIGHT;
        }
        // console.log(display_rect);
      
        var img = PUREIMAGE.make(W, H);
        var ctx = img.getContext('2d');

        // draw frame
        ctx.drawImage(frame,
          0, 0, W, H, // source dimensions
          0, 0, W, H  // destination dimensions
        );

        var text1 = MOMENT().format('HH:mm');
        var text2 = MOMENT().format('MMM DD, ddd');

        ctx.font = (W / 7.5) + "pt 'FreeSansBold'";
        var x;
        var y = display_rect.top;
        y += H / 40;
        var size = ctx.measureText(text1);
        // console.log(size);
        x = display_rect.left + ((display_rect.right - display_rect.left + 1 - size.width) / 2);
        y += size.emHeightAscent;
        draw_shadow_text(ctx, text1, x, y, "#ffffff");
        y += H / 80;
        ctx.font = (W / 16) + "pt 'FreeSansBold'";
        size = ctx.measureText(text2);
        // console.log(size);
        x = display_rect.left + ((display_rect.right - display_rect.left + 1 - size.width) / 2);
        y += size.emHeightAscent;
        draw_shadow_text(ctx, text2, x, y, "#ffffff");
        if (currentWeather) {
          var text3 = "" + currentWeather.temperature + "˚C  " + currentWeather.humidity + "%";
          y += H / 40;
          ctx.font = (W / 15) + "pt 'FreeSansBold'";
          size = ctx.measureText(text3);
          // console.log(size);
          x = display_rect.left + ((display_rect.right - display_rect.left + 1 - size.width) / 2);
          y += size.emHeightAscent;
          draw_shadow_text(ctx, text3, x, y, "#ffffff");
        }

        var s = SHARP(img.data,
          {
            raw: {
              width: img.width,
              height: img.height,
              channels: 4
            }
          });

          const url_parts = URL.parse(req.url, true);
          // console.log(url_parts.query);
          if (url_parts.query && url_parts.query.w) {
            var out_width = parseInt(url_parts.query.w);
            var out_height = parseInt(url_parts.query.h);
            if (!out_height) {
              out_height = out_width * H / W;
            }
            s = s.resize(out_width, out_height)
          }

          s.jpeg({
            quality: 85,
            // chromaSubsampling: '4:4:4'
          })
          .toBuffer()
          .then(data => {
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Content-Length', data.length);
            res.write(data);
            res.end();
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
    face_detection(filename, req, res);
  });
}).listen(8080, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }
  console.log('listen to port 8080...');
});
