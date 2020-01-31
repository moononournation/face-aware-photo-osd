const sharp = require('sharp');
const fr = require('face-recognition');
const fs = require('fs');
const PImage = require('pureimage');
const moment = require('moment');
const http = require('http');

const photoPath = "photo1280/";
const w = 1280, h = 960;
const upper_left = { top: 1, bottom: (h / 2), left: 1, right: (w / 2), area: (w * h / 4) }
const upper_right = { top: 1, bottom: (h / 2), left: (w / 2) + 1, right: w, area: (w * h / 4) }
const lower_left = { top: (h / 2) + 1, bottom: h, left: 1, right: (w / 2), area: (w * h / 4) }
const lower_right = { top: (h / 2) + 1, bottom: h, left: (w / 2) + 1, right: w, area: (w * h / 4) }

var currentWeather;

function overlap_area(rect1, rect2) {
  var overlap_rect = {
    left: Math.max(rect1.left, rect2.left),
    right: Math.min(rect1.right, rect2.right),
    top: Math.max(rect1.top, rect2.top),
    bottom: Math.min(rect1.bottom, rect2.bottom)
  }
  if ((overlap_rect.right > overlap_rect.left) && (overlap_rect.bottom > overlap_rect.top)) {
    overlap_rect.area = (overlap_rect.right - overlap_rect.left + 1) * (overlap_rect.bottom - overlap_rect.top + 1);
  } else {
    overlap_rect = { left: 0, right: 0, top: 0, bottom: 0, area: 0 };
  }

  return overlap_rect;
}

function draw_shadow_text(ctx, text, x, y, color) {
  ctx.fillStyle = '#3f3f3f';
  ctx.fillText(text, x - 2, y - 2);
  ctx.fillStyle = '#3f3f3f';
  ctx.fillText(text, x + 4, y + 4);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function update_weather() {
  if ((!currentWeather) || ((Date.now() - currentWeather.last_update) > (10 * 60 * 1000))) {
    http.get('http://rss.weather.gov.hk/rss/CurrentWeather.xml', (resp) => {
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

/* web server 3002 */
//create a server object:
http.createServer(function (req, res) {
  update_weather();

  fs.readdir(photoPath, function (err, files) {
    var filename = photoPath + files[Math.floor(Math.random() * files.length)];
    const detector = fr.FaceDetector();

    const photo = fr.loadImage(filename);
    const result = detector.locateFaces(photo);
    var ul_overlap = 0;
    var ur_overlap = 0;
    var ll_overlap = 0;
    var lr_overlap = 0;

    result.forEach((value, idx, rect) => {
      // console.log(value.rect);
      ul_overlap += overlap_area(upper_left, value.rect).area;
      ur_overlap += overlap_area(upper_right, value.rect).area;
      ll_overlap += overlap_area(lower_left, value.rect).area;
      lr_overlap += overlap_area(lower_right, value.rect).area;
    });
    var min_overlap = Math.min(Math.min(ul_overlap, ur_overlap), Math.min(ll_overlap, lr_overlap));
    var display_rect;
    if (ll_overlap == min_overlap) {
      display_rect = lower_left;
    } else if (lr_overlap == min_overlap) {
      display_rect = lower_right;
    } else if (ul_overlap == min_overlap) {
      display_rect = upper_left;
    } else {
      display_rect = upper_right;
    }
    // console.log(display_rect);

    PImage.registerFont('font/FreeSansBold.ttf', 'FreeSansBold').load(() => {
      var img = PImage.make(w, h);
      var ctx = img.getContext('2d');
      PImage.decodeJPEGFromStream(fs.createReadStream(filename))
        .then((frame) => {
          // draw frame
          ctx.drawImage(frame,
            0, 0, w, h, // source dimensions
            0, 0, w, h  // destination dimensions
          );

          var text1 = moment().format('HH:mm');
          var text2 = moment().format('MMM DD, ddd');

          ctx.font = (w / 6) + "pt 'FreeSansBold'";
          var x;
          var y = display_rect.top;
          y += h / 40;
          var size = ctx.measureText(text1);
          // console.log(size);
          x = display_rect.left + ((display_rect.right - display_rect.left + 1 - size.width) / 2);
          y += size.emHeightAscent;
          draw_shadow_text(ctx, text1, x, y, "#ffffff");
          y += h / 40;
          ctx.font = (w / 14) + "pt 'FreeSansBold'";
          size = ctx.measureText(text2);
          // console.log(size);
          x = display_rect.left + ((display_rect.right - display_rect.left + 1 - size.width) / 2);
          y += size.emHeightAscent;
          draw_shadow_text(ctx, text2, x, y, "#ffffff");
          if (currentWeather) {
            var text3 = "" + currentWeather.temperature + "˚C  " + currentWeather.humidity + "%";
            y += h / 20;
            ctx.font = (w / 12) + "pt 'FreeSansBold'";
            size = ctx.measureText(text3);
            // console.log(size);
            x = display_rect.left + ((display_rect.right - display_rect.left + 1 - size.width) / 2);
            y += size.emHeightAscent;
            draw_shadow_text(ctx, text3, x, y, "#ffffff");
          }

          sharp(img.data,
            {
              raw: {
                width: img.width,
                height: img.height,
                channels: 4
              }
            })
            .resize(320, 240)
            .jpeg({
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
  });
}).listen(8080, (err) => {
  if (err) {
    return console.log('something bad happened', err)
  }
  console.log('listen to port 8080...');
});
