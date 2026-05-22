const http = require('https');
function check(url) {
  return new Promise(resolve => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({url, status: res.statusCode, data: data.substring(0, 100)}));
    }).on('error', () => resolve({url, error: true}));
  });
}
async function run() {
  console.log(await check('https://my-angge.x10.mx/api/update_ban_status.php'));
  console.log(await check('https://my-angge.x10.mx/api/unban.php'));
  console.log(await check('https://my-angge.x10.mx/api/check_ban.php'));
}
run();
