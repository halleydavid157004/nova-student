import {SOURCE_UA,sourceClient} from '../../src/services/source-http.js';

// Browser never connects to sources itself: every permitted GET goes through
// the same robots, pacing, DNS-pinned transport and body limit as static HTML.
export async function createHeadlessRenderer(browser,{client=sourceClient}={}) {
  return async url=>{
    const context=await browser.newContext({userAgent:SOURCE_UA,serviceWorkers:'block',acceptDownloads:false});
    await context.routeWebSocket('**/*',socket=>socket.close());
    const origin=new URL(url).origin;let requests=0, main;
    await context.route('**/*',async route=>{
      const request=route.request();
      if(request.method()!=='GET'||++requests>40||new URL(request.url()).origin!==origin||
        !['document','script','stylesheet','fetch','xhr'].includes(request.resourceType()))return route.abort();
      try{
        const response=await client.fetch(request.url());
        if(response.blocked||response.status<200||response.status>=400)return route.abort();
        if(request.isNavigationRequest())main=response;
        const headers={...response.headers};
        for(const key of ['content-encoding','content-length','transfer-encoding','set-cookie','location'])delete headers[key];
        await route.fulfill({status:response.status,headers,body:response.body});
      }catch{await route.abort()}
    });
    const page=await context.newPage();
    page.on('popup',popup=>popup.close().catch(()=>{}));
    try{
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
      await page.waitForFunction(()=>/student|estudiant|education/i.test(document.querySelector('main,article')?.textContent||document.body.textContent),{},{timeout:5000}).catch(()=>{});
      return {...main,body:await page.content(),url:main?.url||url,rendered:true};
    }finally{await context.close()}
  };
}
