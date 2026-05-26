
const GUEST_BEARER = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

async function getGuestToken() {
  const res = await fetch('https://api.x.com/1.1/guest/activate.json', {
    method: 'POST',
    headers: {
      'authorization': GUEST_BEARER,
      'content-type': 'application/json'
    }
  });
  const data = await res.json();
  console.log('Guest Token:', data);
  return data.guest_token;
}

async function testFetch(tweetId) {
  const gt = await getGuestToken();
  const variables = {
    tweetId: tweetId,
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false
  };
  const features = {
    creator_subscriptions_tweet_preview_api_enabled: true,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_enhance_cards_enabled: false
  };

  const url = new URL('https://api.x.com/graphql/Vf8sA4N3s0aEqA_aKusEhw/TweetResultByRestId');
  url.searchParams.set('variables', JSON.stringify(variables));
  url.searchParams.set('features', JSON.stringify(features));
  
  const res = await fetch(url.toString(), {
    headers: {
      'authorization': GUEST_BEARER,
      'x-guest-token': gt,
      'content-type': 'application/json'
    }
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testFetch('1779778147373809664');
