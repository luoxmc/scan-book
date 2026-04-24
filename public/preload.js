const cheerio = require("cheerio");
const request = require("request");
const iconv = require('iconv-lite');
const jschardet = require("jschardet");
const { HttpProxyAgent,HttpsProxyAgent } = require('hpagent');
const fs = require("fs");

Date.prototype.format = function(fmt) {
  let o = {
    "M+" : this.getMonth()+1,                 //月份
    "d+" : this.getDate(),                    //日
    "h+" : this.getHours(),                   //小时
    "m+" : this.getMinutes(),                 //分
    "s+" : this.getSeconds(),                 //秒
    "q+" : Math.floor((this.getMonth()+3)/3), //季度
    "S"  : this.getMilliseconds()             //毫秒
  };
  if(/(y+)/.test(fmt)) {
    fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length));
  }
  for(let k in o) {
    if(new RegExp("("+ k +")").test(fmt)){
      fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length)));
    }
  }
  return fmt;
}

const absUrl = function (url,base) {
  if (!url || !base) return null
  if (url.startsWith("http")) return url
  if (url.startsWith("//")) {
    let protocol = base.substring(0,base.indexOf("//")) //https:
    if (!protocol) return null
    return protocol + url
  }
  try {
    let urlObj = new URL(url,base)
    if (!urlObj) return null
    return urlObj.href
  } catch (e) {
    console.error('exchange url error, msg : ',e)
    return null
  }
}

const escapeRegExp = function (str) {
  if (str === null || str === undefined) return ''
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const buildFilterRegExp = function (filterItem) {
  // 1) 字符串：默认按“纯文本”处理；若为 /pattern/flags 格式则按正则处理
  if (typeof filterItem === 'string') {
    let s = filterItem.trim()
    let m = s.match(/^\/([\s\S]*)\/([gimsuy]*)$/)
    if (m) {
      let pattern = m[1]
      let flags = m[2] || 'g'
      return new RegExp(pattern, flags)
    }
    return new RegExp(escapeRegExp(s), 'g')
  }

  // 2) 对象：支持 { pattern, flags } 或 { regex, flags }（按正则处理）
  if (filterItem && typeof filterItem === 'object') {
    let pattern = null
    let flags = null
    if (typeof filterItem.pattern === 'string') {
      pattern = filterItem.pattern
      flags = typeof filterItem.flags === 'string' ? filterItem.flags : null
    } else if (typeof filterItem.regex === 'string') {
      pattern = filterItem.regex
      flags = typeof filterItem.flags === 'string' ? filterItem.flags : null
    } else if (typeof filterItem.text === 'string') {
      return new RegExp(escapeRegExp(filterItem.text), 'g')
    }
    if (!pattern) {
      return null
    }
    return new RegExp(pattern, flags || 'g')
  }
  return null
}

window.services = {
  /*** 获取书籍书名以及章节列表 ***/
  getTask: (url, concurrency, startChapter, endChapter, headers, rule, filter, proxy, page, callback) => {
    if (typeof page === 'function') {
      callback = page;
      page = null;
    }
    let response = {};
    response.err_no = 0;
    response.err_info = "调用成功";
    let task = {};
    task.id = new Date().getTime().toString();
    task.url = url;
    if (!headers){
      headers = {};
    }
    if (!headers['User-Agent']) {
      headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
    }
    if (!headers['Connection']) {
      headers['Connection'] = 'keep-alive';
    }
    request(url, {encoding: null, gzip: true, headers: headers, timeout:12000}, function (err, res, body) {
      if (!err && res.statusCode === 200) {
        let _html = window.services.getOkText(body);
        if (!_html) {
          response.err_no = 1;
          response.err_info = '解析网站信息失败';
          callback(response);
        } else {
          $ = cheerio.load(_html);
          let getBookName = function () {
            try {
              let result = '';
              let nameReg = ['#info h1', '.info h1', '.book-info h1 em', '.bookinfo h1', '.pt-name a', '.bookNm a' , '.title span', '.f20h', '.caption p', '#bookdetail #info h1' , '.tna a' , '*title', '*name', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h3 a'];
              for (let i = 0; i < nameReg.length; i++) {
                let tmp;
                if (nameReg[i].startsWith("*")) {
                  let attr = nameReg[i].replace("*", "");
                  tmp = $("[id*=" + attr + "] h1");
                  if (tmp.length <= 0) {
                    tmp = $("[class*=" + attr + "] h1");
                  }
                  if (tmp.length <= 0) {
                    tmp = $("[id*=" + attr + "]");
                  }
                  if (tmp.length <= 0) {
                    tmp = $("[class*=" + attr + "]");
                  }
                } else {
                  tmp = $(nameReg[i]);
                }
                if (tmp.length <= 0) {
                  continue;
                }
                for (let j = 0; j < tmp.length; j++) {
                  let tmp1 = tmp[j];
                  let txt = $(tmp1).text();
                  if (txt && txt.length >= 2 && txt.length <= 20) {
                    if(txt.indexOf('友情链接') !== -1){
                      continue;
                    }
                    result = txt;
                    break;
                  }
                }
                if (result) {
                  break;
                }
              }
              return result;
            } catch (e) {
              console.log(e);
              return null;
            }
          }
          let getBookMenu = function () {
            try {
              let result = [];
              let menuReg = ['#list dl dd a','.listmain dl dd a', '.book_list ul li a', '#chapterList li a', '.volume-wrap ul li a', '#all_chapter a' , '.boxT .lfT li a' , '.booklist span a',
                  '.listmain dl dd a', '#list ul li a', '.section-box .section-list li a', "#chapterlist p", '.ccss a', '.book-section a', ".book_con ul li a" , '#mulu .DivTable .DivTd a' ,
                 '#catalog .chapter-item a' , '.conter .clc a' ,  '*chapter', '*menu', '*list', 'ul li a', 'dl dd a', 'tr td a'];
              for (let i = 0; i < menuReg.length; i++) {
                let tmp;
                if (menuReg[i].startsWith("*")) {
                  let attr = menuReg[i].replace("*", "");
                  tmp = $("[id*=" + attr + "] ul li a");
                  if (tmp.length <= 10) {
                    tmp = $("[class*=" + attr + "] ul li a");
                  }
                  if (tmp.length <= 10) {
                    tmp = $("[id*=" + attr + "] dl dd a");
                  }
                  if (tmp.length <= 10) {
                    tmp = $("[class*=" + attr + "] dl dd a");
                  }
                  if (tmp.length <= 10) {
                    tmp = $("[id*=" + attr + "] tr td a");
                  }
                  if (tmp.length <= 10) {
                    tmp = $("[class*=" + attr + "] tr td a");
                  }
                  if (tmp.length <= 10) {
                    tmp = $("[id*=" + attr + "] a");
                  }
                  if (tmp.length <= 10) {
                    tmp = $("[class*=" + attr + "] a");
                  }
                } else {
                  tmp = $(menuReg[i]);
                }
                if (tmp.length <= 10) {
                  continue;
                }
                result = checkMenus(tmp);
                if (result && result.length > 0) {
                  break;
                }
              }
              return result;
            } catch (e) {
              console.log(e);
              return null;
            }
          }
	          let checkMenus = function ($ele) {
	            try {
	              let result = [];
	              let start = false;
	              let startChapterExit = false;
	              for (let j = 0; j < $ele.length; j++) {
	                let tmp = $ele[j];
	                let href = tmp.attribs.href;
	                if (!href || href === '#' || href.indexOf('javascript') !== -1) {
	                  continue;
	                }
	                let txt = $(tmp).text();
	                if (!txt) {
	                  continue;
	                }
	                txt = String(txt).trim();
	                if (!txt) {
	                  continue;
	                }
	                if ( startChapter && txt.indexOf(startChapter) !== -1) {
	                  //指定了开始章节则按定义的开始章节开始抓取
	                  start = true;
	                  startChapterExit = true;
	                } else if (!startChapter && (txt.indexOf("第一章") !== -1 || txt.indexOf("第1章") !== -1 || txt.indexOf("序") !== -1 || txt.indexOf("楔子") !== -1 || txt.indexOf("前言") !== -1
	                    || txt.indexOf("第一卷") !== -1 || txt.indexOf("第1卷") !== -1 || txt.indexOf("第一回") !== -1 || txt.indexOf("第1回") !== -1 || txt.indexOf("第01章") !== -1
	                    || txt.indexOf("第一页") !== -1 || txt.indexOf("第1页") !== -1 || txt.indexOf("0001") !== -1 || txt.indexOf("001") !== -1
	                    || txt.startsWith("1") || txt.startsWith("01")  || txt.startsWith("001") || txt.startsWith("一") ) ) {
	                  start = true;
	                }
	                if (start) {
	                  let abs = absUrl(href, url);
	                  if (!abs) {
	                    continue;
	                  }
	                  result.push({ url: abs, title: txt });
	                  if (endChapter &&  txt.indexOf(endChapter) !== -1) {
	                    //遇到指定的结束章节，结束
	                    break;
	                  }
	                }
	              }
              if (startChapter && !startChapterExit) {
                return '未找到您定义的开始章节';
              }
              return result;
	            } catch (e) {
	              console.log(e);
	              return '获取章节列表失败,错误信息:' + e;
	            }
	          }
	          let bookName = '';
          if (rule && rule.book_name) {
            bookName = $(rule.book_name).text();
            if (!bookName) {
              response.err_no = 2;
              response.err_info = '获取书籍名称失败，请检查您的json规则是否正确';
            }
          } else {
            bookName = getBookName();
            if (!bookName) {
              response.err_no = 3;
              response.err_info = '智能解析书名失败，可能暂未支持该网站';
            }
          }
	          if (!bookName) {
	            callback(response);
	          } else {
	            task.name = bookName;
	            let menu ;
	            if (rule && rule.book_menu) {
	              let tmp = $(rule.book_menu);
	              menu = checkMenus(tmp);
	              if (!menu || menu.length <= 0) {
	                response.err_no = 5;
	                response.err_info = '获取章节列表失败，请检查您的json规则是否正确';
	              }
	            } else {
	              menu = getBookMenu();
	              if (!menu || menu.length <= 0) {
	                response.err_no = 6;
	                response.err_info = '智能解析章节列表失败，可能未识别到起始章节或暂未支持该网站';
	              }
	            }
	            if (typeof menu === 'string') {
	              response.err_no = 4;
	              response.err_info = menu;
	              callback(response);
	            } else if (!menu || menu.length <= 0) {
	              callback(response);
	            } else {
	              let menuUrls = [];
	              let menuTitles = [];
	              menu.forEach((one) => {
	                if (!one) return;
	                if (typeof one === 'string') {
	                  menuUrls.push(one);
	                  menuTitles.push('');
	                } else if (one.url) {
	                  menuUrls.push(one.url);
	                  menuTitles.push(one.title || '');
	                }
	              });
	              if (menuUrls.length <= 0) {
	                response.err_no = 6;
	                response.err_info = '智能解析章节列表失败，可能未识别到起始章节或暂未支持该网站';
	                callback(response);
	                return;
	              }
	              task.rule = rule;
	              task.filter = filter;
	              task.headers = headers;
	              task.menu = menuUrls;
	              task.menuTitle = menuTitles;
	              task.status = 0;
	              task.statusText = '任务处理中';
	              task.progress = '0';
	              task.concurrency = concurrency;
	              task.page = page;
              if (proxy) {
                proxy.unshift('localhost');
                task.proxy = proxy;
                task.curProxyIndex = 0;
                task.curProxy = 'localhost'
              }
              response.result = task;
              callback(response);
            }
          }
        }
      } else {
        let info = "访问书籍首页地址出错, ";
        if (err){
          console.log(err);
          info += "错误信息:" + err ;
        } else {
          info += "请求状态码:" + res.statusCode ;
        }
        response.err_no = 99;
        response.err_info = info;
        callback(response);
      }
    })
  },
  /*** 获取章节标题、章节内容并写入到临时文件 ***/
  getChapter: (task, chapterIndex, callback) => {
    if (typeof chapterIndex === 'function') {
      callback = chapterIndex;
      chapterIndex = null;
    }
    let response = {};
    response.err_no = 0;
    response.err_info = "保存成功";
    let separator = window.platform.isWindows ? "\u005C" : "/";
    let rootPath = window.utools.getPath("temp") + separator + "scan-book";
    if (!fs.existsSync(rootPath)) {
      fs.mkdirSync(rootPath);
    }
    if (!task || !task.name || !task.id || !task.menu || task.menu.length <= 0) {
      return;
    }
    let idx = typeof chapterIndex === 'number' ? chapterIndex : (task.curChapter || 0);
    if (idx < 0 || idx >= task.menu.length) {
      response.err_no = 98;
      response.err_info = '章节索引越界';
      callback(response);
      return;
    }
    let preferMenuTitle = '';
    if (task.menuTitle && Array.isArray(task.menuTitle) && task.menuTitle[idx]) {
      preferMenuTitle = String(task.menuTitle[idx]).trim();
    }
    let taskDir = rootPath + separator + task.id;
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir);
    }
    let chapterPath = taskDir + separator + (idx + '.txt');
    let baseOptions = {encoding: null, gzip: true, headers: task.headers, timeout:10000};

    const buildOptions = function (pageUrl) {
      let options = Object.assign({}, baseOptions);
      //代理配置
      if (task.proxy && task.proxy.length > 0) {
        let proxy = "http://" + task.curProxy;
        if ("http://localhost" !== proxy) {
          let agent = pageUrl.startsWith("https") ? new HttpsProxyAgent({
            keepAlive: true,
            keepAliveMsecs: 5000,
            maxSockets: 256,
            maxFreeSockets: 256,
            scheduling: 'lifo',
            proxy
          }) : new HttpProxyAgent({
            keepAlive: true,
            keepAliveMsecs: 5000,
            maxSockets: 256,
            maxFreeSockets: 256,
            scheduling: 'lifo',
            proxy
          });
          options.agent = agent;
        }
      }
      return options;
    }

    const loadPage = function (pageUrl) {
      return new Promise((resolve) => {
        request(pageUrl, buildOptions(pageUrl), function (err, res, body) {
          resolve({ err, res, body });
        });
      });
    }

    const getNextPageUrl = function ($, currentUrl) {
      if (!task.page || !task.page.enabled) {
        return null;
      }
      let selector = (task.page.nextSelector || '').trim();
      let hasText = (task.page.nextHasText || '').trim();
      let noText = (task.page.nextNoText || '').trim();
      let custom = !!(selector || hasText || noText);

      const pickHref = function (ele) {
        if (!ele) return null;
        let href = null;
        if (ele.name === 'a' && ele.attribs && ele.attribs.href) {
          href = ele.attribs.href;
        } else if (ele.attribs && ele.attribs.href) {
          href = ele.attribs.href;
        } else {
          let a = $(ele).find('a[href]').first();
          if (a && a.length > 0) {
            href = a.attr('href');
          }
        }
        if (!href || href === '#' || href.indexOf('javascript') !== -1) return null;
        return absUrl(href, currentUrl);
      }

      if (custom) {
        let eles = selector ? $(selector) : $('a');
        if (!eles || eles.length <= 0) return null;
        for (let i = 0; i < eles.length; i++) {
          let ele = eles[i];
          let txt = $(ele).text();
          if (txt) txt = txt.trim();
          if (noText && txt && txt.indexOf(noText) !== -1) {
            return null;
          }
          if (hasText && (!txt || txt.indexOf(hasText) === -1)) {
            continue;
          }
          let nextUrl = pickHref(ele);
          if (nextUrl) return nextUrl;
        }
        return null;
      }

      // 默认规则：找文本包含“下一页”且总字数<=10的a标签
      let as = $('a');
      if (!as || as.length <= 0) return null;
      for (let i = 0; i < as.length; i++) {
        let a = as[i];
        let txt = $(a).text();
        if (!txt) continue;
        txt = txt.trim();
        if (txt.length > 10) continue;
        if (txt.indexOf('下一页') === -1) continue;
        let nextUrl = pickHref(a);
        if (nextUrl) return nextUrl;
      }
      return null;
    }

    const parseOnePage = async function (_html, currentUrl, requireTitle) {
      let getChapterTitle = function () {
            let result = '';
            let tmpTxt = '';
            let nameReg = [ '.box_con .bookname h1', '#book .content h1', '#box_con .bookname h1', '.readAreaBox h1', '.content-wrap', '.art_tit', '*title', '*name', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h1 span'];
            for (let i = 0; i < nameReg.length; i++) {
              let tmp;
              if (nameReg[i].startsWith("*")) {
                let attr = nameReg[i].replace("*", "");
                tmp = $("[id*=" + attr + "] h1");
                if (tmp.length <= 0) {
                  tmp = $("[class*=" + attr + "] h1");
                }
                if (tmp.length <= 0) {
                  tmp = $("[id*=" + attr + "]");
                }
                if (tmp.length <= 0) {
                  tmp = $("[class*=" + attr + "]");
                }
              } else {
                tmp = $(nameReg[i]);
              }
              if (tmp.length <= 0) {
                continue;
              }
              for (let j = 0; j < tmp.length; j++) {
                let tmp1 = tmp[j];
                if (tmp1.children.length !== 1) {
                  continue;
                }
                let txt = $(tmp1).text();
                if (txt && txt.length >= 1 && txt.length <= 33) {
                  if(txt.indexOf('第') === -1 ){
                    if(!tmpTxt){
                      tmpTxt = txt;
                    }
                    continue;
                  }
                  result = txt;
                  break;
                } else if (txt && txt.length > 33 && txt.length <= 53) {
                  tmpTxt = txt;
                }
              }
              if (result) {
                break;
              }
            }
            if(!result && tmpTxt){
              result = tmpTxt;
            }
            return result;
          }
          let getChapterContent = function () {
            return new Promise(async (resolve) => {
              let getDynamicContent = function (href){
                return new Promise((resolve1) => {
                  let abs = absUrl(href, currentUrl);
                  if (!abs) {
                    resolve1(null);
                    return;
                  }
                  request( abs, {encoding: null, gzip: true, headers: task.headers, timeout:15000}, function (err, res, body) {
                    if (!err && res.statusCode === 200) {
                      resolve1(window.services.getOkText(body));
                    } else {
                      resolve1(null);
                    }
                  });
                });
              }
              let result = '';
              if (task.url.indexOf("tadu.com") !== -1) {
                let href = $("#bookPartResourceUrl").val();
                if(href){
                  let resultCont = await getDynamicContent(href);
                  if(resultCont){
                    resultCont = resultCont.substring(0,resultCont.length-3).replace("callback({content:'","");
                    resultCont = '<div>' + resultCont.replace(/<\/p>/g,"</p>\n").replace(/<br\s*\/?>/g,"\n") + '</div>';
                    result = $(resultCont).text();
                  }
                }
              } else {
                let tmpTxt = '';
                let contentReg = [ '.read-content', '#ChapterBody', '.readAreaBox .p' , '.read_chapterDetail', '.novel_content', '.box_box', '#Lab_Contents', '#chaptercontent',
                  '#acontent', '.container .con', '.showtxt','.panel-body', '.main_content .book_con' , '.zw', '*content','*text','*txt','*nr','*chapter','*cont','*article','*read' ];
                for (let i = 0; i < contentReg.length; i++) {
                  let tmp;
                  if (contentReg[i].startsWith("*")) {
                    let attr = contentReg[i].replace("*", "");
                    tmp = $("div[id*=" + attr + "]");
                    if (tmp.length <= 0) {
                      tmp = $("div[class*=" + attr + "]");
                    }
                    if (tmp.length <= 0) {
                      tmp = $("[id*=" + attr + "]");
                    }
                    if (tmp.length <= 0) {
                      tmp = $("[class*=" + attr + "]");
                    }
                  } else {
                    tmp = $(contentReg[i]);
                  }
                  if (tmp.length <= 0) {
                    continue;
                  }
                  for (let j = 0; j < tmp.length; j++) {
                    let tmp1 = tmp[j];
                    if (tmp1.children.length <= 1) {
                      continue;
                    }
                    let as = $(tmp1).find("a");
                    if(as && as.length > 0){
                      as.each(function (idx,one) {
                        if(one && $(one).text() && $(one).attr("href")){
                          $(one).remove();
                        }
                      })
                    }
                    let txt = $(tmp1).text();
                    if(txt && txt.length < 150){
                      tmpTxt = txt;
                      continue;
                    }
                    if (txt) {
                      let tmpHtml = '<div>' + $(tmp1).html().replace(/<\/p>/g,"</p>\n").replace(/<br\s*\/?>/g,"\n") + '</div>';
                      result = $(tmpHtml).text();
                      break;
                    }
                  }
                  if (result) {
                    break;
                  }
                }
                if(!result && tmpTxt){
                  result = tmpTxt;
                }
                if (result) {
                  let reg = /(正文)?(第)([零〇一二三四五六七八九十百千万a-zA-Z0-9]{1,7})[章节卷集部篇回]((?! {4}).)((?!\t{1,4}).){0,30}\r?\n/g;
                  result = result.replace(reg,'').replace(/\n{2,}/g,"\n").replace(/\n+\s*\n+/g,"\n");
                }
              }
              resolve(result);
            });
          }
      $ = cheerio.load(_html);
      let title = '';
      if (requireTitle) {
        if (task.rule && task.rule.chapter_title) {
          title = $(task.rule.chapter_title).text();
          if (!title) {
            return { err_no: 2, err_info: '获取章节标题失败，请检查您的json规则是否正确' };
          }
        } else {
          title = getChapterTitle();
          if (!title) {
            return { err_no: 3, err_info: '智能解析章节标题失败，可能暂未支持该网站' };
          }
        }
        if (!title) {
          return { err_no: 3, err_info: '获取章节标题失败' };
        }
      } else {
        // 后续分页不强制要求标题存在（部分站点分页页不包含标题）
        title = '';
      }
      let content = '';
      if (task.rule && task.rule.chapter_content) {
        content = $(task.rule.chapter_content).text();
        if (!content) {
          return { err_no: 3, err_info: '获取章节正文失败，请检查您的json规则是否正确' };
        }
      } else {
        content = await getChapterContent();
        if (!content) {
          return { err_no: 4, err_info: '智能解析章节正文失败，可能暂未支持该网站' };
        }
      }
      if (!content) {
        return { err_no: 4, err_info: '获取章节正文失败' };
      }
      if(task.filter && task.filter.length > 0){
        try {
          task.filter.forEach((one_filter) => {
            let reg = buildFilterRegExp(one_filter)
            if (!reg) {
              return
            }
            content = content.replace(reg,'')
          })
        } catch (e) {
          return { err_no: 7, err_info: '过滤规则正则不合法，请检查。错误信息:' + e }
        }
      }
      let nextUrl = getNextPageUrl($, currentUrl);
      return { err_no: 0, title, content, nextUrl };
    };

    ;(async () => {
      try {
        const normalizePageContent = function (txt, isFirstPage) {
          if (!txt) return ''
          let s = String(txt).replace(/\r/g, '')
          // 只清理分页边界的多余空白/换行，保证章节内部连贯
          if (!isFirstPage) {
            s = s.replace(/^\s+/, '')
          }
          s = s.replace(/\s+$/, '')
          return s
        }

        let firstUrl = task.menu[idx];
        let pageUrl = firstUrl;
        let contents = [];
        let title = preferMenuTitle || '';
        let visited = {};
        let maxPages = 50;
        for (let pageNo = 0; pageNo < maxPages; pageNo++) {
          if (!pageUrl) {
            break;
          }
          if (visited[pageUrl]) {
            response.err_no = 96;
            response.err_info = '检测到分页链接循环，已终止该章节爬取';
            callback(response);
            return;
          }
          visited[pageUrl] = true;

          let loaded = await loadPage(pageUrl);
          if (loaded.err || !loaded.res || loaded.res.statusCode !== 200) {
            response.err_no = 99;
            response.err_info = '访问章节地址出错，错误信息:' + (loaded.err || (loaded.res && loaded.res.statusCode));
            callback(response);
            return;
          }
          let _html = window.services.getOkText(loaded.body);
          if (!_html) {
            response.err_no = 1;
            response.err_info = '解析网站信息失败';
            callback(response);
            return;
          }
          // 如果书籍目录页已经解析到章节标题，则优先使用目录标题，避免因内容页标题解析差异导致“标题被修改/缺数字”
          let parsed = await parseOnePage(_html, pageUrl, pageNo === 0 && !preferMenuTitle);
          if (!parsed || parsed.err_no !== 0) {
            response.err_no = parsed ? parsed.err_no : 5;
            response.err_info = parsed ? parsed.err_info : '解析章节失败';
            callback(response);
            return;
          }
          if (pageNo === 0 && !preferMenuTitle) {
            title = parsed.title;
          }
          contents.push(normalizePageContent(parsed.content, pageNo === 0));

          if (!task.page || !task.page.enabled) {
            break;
          }
          let nextUrl = parsed.nextUrl;
          if (!nextUrl) {
            break;
          }
          if (nextUrl === pageUrl) {
            break;
          }
          if (pageNo === maxPages - 1) {
            response.err_no = 95;
            response.err_info = '分页数量过多，已终止该章节爬取';
            callback(response);
            return;
          }
          pageUrl = nextUrl;
        }
        if (!title || contents.length <= 0) {
          response.err_no = 5;
          response.err_info = '章节内容为空';
          callback(response);
          return;
        }
        let fullContent = contents
          .filter((c) => c && String(c).trim() !== '')
          .reduce((acc, cur) => acc ? (acc + "\n" + cur) : cur, '');
        fs.writeFileSync(chapterPath, title + " \n" + fullContent + " \n");
        response.path = chapterPath;
        response.title = title;
        callback(response);
      } catch (e) {
        console.log(e);
        response.err_no = 97;
        response.err_info = '爬取分页章节出错，错误信息:' + e;
        callback(response);
      }
    })();
  },
  /***  检查文件是否存在并可写  ***/
  checkFile: (path) => {
    try {
      fs.accessSync(path);
    } catch (e) {
      return false;
    }
    try {
      fs.accessSync(path, fs.constants.W_OK);
    } catch (e) {
      return false;
    }
    return true;
  },
  /***  保存文件  ***/
  saveFile: (tmpPath,newPath) => {
    try {
      let readStream=fs.createReadStream(tmpPath);
      let writeStream=fs.createWriteStream(newPath);
      readStream.pipe(writeStream);
      readStream.on('end',function(){
        fs.unlinkSync(tmpPath);
      });
    } catch (e) {
      console.log(e);
      return '保存出错,错误信息：' + e;
    }
    return 'ok';
  },
  /***  合并保存书籍章节内容  ***/
  saveBook: (task, savePath) => {
    try {
      let separator = window.platform.isWindows ? "\u005C" : "/";
      let rootPath = window.utools.getPath("temp") + separator + "scan-book";
      let oldPath = rootPath + separator + task.id + '.txt';
      let taskDir = rootPath + separator + task.id;
      if (!task || !task.id || !task.menu || task.menu.length <= 0) {
        return '任务数据不完整';
      }

      // 兼容旧版本：单文件临时存储
      if (!fs.existsSync(taskDir) && fs.existsSync(oldPath)) {
        let buf = fs.readFileSync(oldPath);
        fs.writeFileSync(savePath, buf);
        return 'ok';
      }
      if (!fs.existsSync(taskDir)) {
        return '未找到临时文件，请重新爬取';
      }

      let fd = fs.openSync(savePath ,'w');
      for (let i = 0; i < task.menu.length; i++) {
        let chapterPath = taskDir + separator + (i + '.txt');
        if (fs.existsSync(chapterPath)) {
          let buf = fs.readFileSync(chapterPath);
          fs.writeSync(fd, buf);
          // 章节之间补一个换行，避免内容连在一起
          fs.writeSync(fd, Buffer.from("\n"));
        }
      }
      fs.closeSync(fd);
    } catch (e) {
      console.log(e);
      return '保存出错,错误信息：' + e;
    }
    return 'ok';
  },
  /***  清空临时目录中本插件的文件  ***/
  emptyTempDir: () => {
    try {
      let separator = window.platform.isWindows ? "\u005C" : "/";
      let path = window.utools.getPath("temp") + separator + "scan-book" + separator ;
      const files = fs.readdirSync(path);
      files.forEach(file => {
        const filePath = path + separator + file;
        if (fs.statSync(filePath).isDirectory()) {
          fs.rmdirSync(filePath, { recursive: true });
        } else {
          fs.unlinkSync(filePath);
        }
      });
    } catch (e) {
      return false;
    }
    return true;
  },
  /***  根据任务id删除临时文件  ***/
  deleteTemp: (id) => {
    try {
      let separator = window.platform.isWindows ? "\u005C" : "/";
      let rootPath = window.utools.getPath("temp") + separator + "scan-book";
      let oldPath = rootPath + separator + id + ".txt" ;
      let taskDir = rootPath + separator + id;
      if (fs.existsSync(taskDir) && fs.statSync(taskDir).isDirectory()) {
        fs.rmdirSync(taskDir, { recursive: true });
      } else if (window.services.checkFile(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    } catch (e) {
      console.log(e);
      return false;
    }
    return true;
  },
  /***  将buffer转成格式正常的字符串  ***/
  getOkText: (buf) => {
    if(!buf || buf.length <= 0){
      return '';
    }
    //使用jschardet检查文件编码
    let encodingCheck = jschardet.detect(buf);
    //用检查出来的编码将buffer转成字符串
    if (encodingCheck.confidence >= 0.6) {
      return  iconv.decode(buf, encodingCheck.encoding);
    } else {
      let str =  iconv.decode(buf, 'utf-8');
      let idx = str.indexOf("�");
      if (idx !== -1) {
        idx = str.indexOf("�", idx + 1);
        if (idx !== -1) {
          str =  iconv.decode(buf, 'gbk');
        }
      }
      return str;
    }
  }
}
