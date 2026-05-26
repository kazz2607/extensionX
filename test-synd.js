/**
 * test-synd.js — Test Syndication API với token formula đúng
 * Chạy trong Node.js: node test-synd.js
 * Hoặc paste vào DevTools Console của X.com
 */

function getSyndicationToken(tweetId) {
  // Dùng BigInt để tránh mất precision
  const idBig = BigInt(tweetId);
  const quotient = Number(idBig / 1000000000000000n);
  return (quotient * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

async function testSynd(tweetId = '1779778147373809664') {
  const token = getSyndicationToken(tweetId);
  console.log(`Token cho tweet ${tweetId}: "${token}"`);

  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`;
  console.log('URL:', url);

  const res = await fetch(url);

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Response keys:', Object.keys(data));

  // Parse video nếu có
  if (data.video?.variants) {
    console.log('✓ Video variants (data.video.variants):');
    data.video.variants.forEach(v => {
      console.log(`  [${v.type}] bitrate=${v.bitrate || 'N/A'} → ${v.src}`);
    });
  } else if (data.mediaDetails) {
    const video = data.mediaDetails.find(m => m.type === 'video' || m.type === 'animated_gif');
    if (video?.video_info?.variants) {
      console.log('✓ Video variants (data.mediaDetails):');
      video.video_info.variants.forEach(v => {
        console.log(`  [${v.content_type}] bitrate=${v.bitrate || 'N/A'} → ${v.url}`);
      });
    }
  } else {
    console.warn('Không tìm thấy video trong response. Full data:');
    console.log(JSON.stringify(data, null, 2).slice(0, 2000));
  }
}

testSynd('1779778147373809664');
