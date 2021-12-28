const cheerio = require("cheerio");
const request = require("request");
const iconv = require('iconv-lite');
const jschardet = require("jschardet");
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

window.services = {
  /*** 获取书籍书名以及章节列表 ***/
  getTask: (url, time, rule, callback) => {
    let response = {};
    response.err_no = 0;
    response.err_info = "调用成功";
    let task = {};
    task.id = new Date().getTime().toString();
    task.url = url;
    request(url, {encoding: null,timeout:20000}, function (err, res, body) {
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
              let nameReg = ['.book-info h1 em', '.pt-name a', '.title span', '.f20h', '.caption p', "*title", "*name", 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h3 a'];
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
                  let txt = tmp1.children[0].data;
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
              let menuReg = ['.volume-wrap ul li a', '.booklist span a', "#chapterlist p", '.ccss a', '.book-section a', '*menu', '*list', 'ul li a', 'dl dd a', 'tr td a'];
              for (let i = 0; i < menuReg.length; i++) {
                let tmp;
                if (menuReg[i].startsWith("*")) {
                  let attr = menuReg[i].replace("*", "");
                  tmp = $("[id*=" + attr + "] ul li a");
                  if (tmp.length <= 5) {
                    tmp = $("[class*=" + attr + "] ul li a");
                  }
                  if (tmp.length <= 5) {
                    tmp = $("[id*=" + attr + "] dl dd a");
                  }
                  if (tmp.length <= 5) {
                    tmp = $("[class*=" + attr + "] dl dd a");
                  }
                  if (tmp.length <= 5) {
                    tmp = $("[id*=" + attr + "] tr td a");
                  }
                  if (tmp.length <= 5) {
                    tmp = $("[class*=" + attr + "] tr td a");
                  }
                  if (tmp.length <= 5) {
                    tmp = $("[id*=" + attr + "] a");
                  }
                  if (tmp.length <= 5) {
                    tmp = $("[class*=" + attr + "] a");
                  }
                } else {
                  tmp = $(menuReg[i]);
                }
                if (tmp.length <= 5) {
                  continue;
                }
                console.log(tmp);
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
              for (let j = 0; j < $ele.length; j++) {
                let tmp = $ele[j];
                let href = tmp.attribs.href;
                if (!href || href === '#' || href.indexOf('javascript') !== -1) {
                  continue;
                }
                let txt = '';
                if (tmp.children.length === 1 && tmp.children[0].type === 'text') {
                  txt = tmp.children[0].data;
                  if (txt) {
                    txt = txt.replace(/\s+/g, '');
                  }
                }
                if (!txt) {
                  for (let k = 0; k < tmp.children.length; k++) {
                    if (tmp.children[k].name === 'span') {
                      txt = $(tmp.children[k]).text();
                      break;
                    }
                  }
                  if (!txt) {
                    continue;
                  }
                }
                if (txt.indexOf("第一章") !== -1 || txt.indexOf("第1章") !== -1 || txt.indexOf("序") !== -1 || txt.indexOf("楔子") !== -1 || txt.indexOf("前言") !== -1
                    || txt.indexOf("第一卷") !== -1 || txt.indexOf("第1卷") !== -1 || txt.indexOf("第一回") !== -1 || txt.indexOf("第1回") !== -1 || txt.indexOf("第01章") !== -1
                    || txt.indexOf("第001章") !== -1 || txt.indexOf("第0001章") !== -1) {
                  start = true;
                }
                if (start) {
                  if (href.startsWith("/chapter/")) {
                    href = url.substring(0, url.indexOf("//") + 2) + url.substring(url.indexOf("//") + 2).substring(0, url.substring(url.indexOf("//") + 2).indexOf("/")) + href;
                  } else if (href.startsWith("//")) {
                    href = url.substring(0, url.indexOf("//")) + href;
                  } else if (href.startsWith("http")) {

                  } else if (href.startsWith("/")) {
                    let prefix = href.substring(0, href.lastIndexOf("/"));
                    if (prefix) {
                      if (url.indexOf(prefix)) {
                        href = url.substring(0, url.lastIndexOf("/")) + href.substring(href.lastIndexOf("/"));
                      } else {
                        href = url.substring(0, url.lastIndexOf("/")) + href;
                      }
                    } else {
                      href = url.substring(0, url.lastIndexOf("/")) + href;
                    }
                  } else {
                    href = url.substring(0, url.lastIndexOf("/") + 1) + href;
                  }
                  result.push(href);
                }
              }
              return result;
            } catch (e) {
              console.log(e);
              return null;
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
            let menu = [];
            if (rule && rule.book_menu) {
              let tmp = $(rule.book_menu);
              menu = checkMenus(tmp);
              if (!menu || menu.length <= 0) {
                response.err_no = 3;
                response.err_info = '获取章节列表失败，请检查您的json规则是否正确';
              }
            } else {
              menu = getBookMenu();
              if (!menu || menu.length <= 0) {
                response.err_no = 4;
                response.err_info = '智能解析章节列表失败，可能暂未支持该网站';
              }
            }
            if (!menu || menu.length <= 0) {
              callback(response);
            } else {
              task.rule = rule;
              task.menu = menu;
              task.status = 0;
              task.statusText = '任务处理中';
              task.progress = '0';
              task.curChapter = 0;
              task.interval = time;
              task.log = '';
              response.result = task;
              callback(response);
            }
          }
        }
      } else {
        console.log(err);
        response.err_no = 99;
        response.err_info = '访问书籍首页地址出错，错误信息:' + err;
        callback(response);
      }
    })
  },
  /*** 获取章节标题、章节内容并写入到临时文件 ***/
  getChapter: (task, callback) => {
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
    let path = rootPath + separator + task.id + '.txt';
    if (!window.services.checkFile(path)) {
      fs.createWriteStream(path);
    }
    request(task.menu[task.curChapter], {encoding: null,timeout:20000}, function (err, res, body) {
      let logs = '<p><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>开始解析url为【'+task.menu[task.curChapter]+'】的章节</p>';
      if (!err && res.statusCode === 200) {
        let _html = window.services.getOkText(body);
        if (!_html) {
          logs += '<p style="color: red"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>解析url【'+task.menu[task.curChapter]+'】出错，未获取到网页信息</p>';
          response.err_no = 1;
          response.err_info = '解析网站信息失败';
          response.log = logs;
          callback(response);
        } else {
          let getChapterTitle = function () {
            let result = '';
            let tmpTxt = '';
            let nameReg = [ '.content-wrap', '*title', '*name', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
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
                let txt = tmp1.children[0].data;
                if (txt && txt.length >= 1 && txt.length <= 30) {
                  if(txt.indexOf('第') === -1){
                    tmpTxt = txt;
                    continue;
                  }
                  result = txt;
                  break;
                } else if (txt && txt.length > 30 && txt.length <= 50) {
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
            let result = '';
            let tmpTxt = '';
            let contentReg = [ '.read-content', '.novel_content', '.box_box','.showtxt','.panel-body','.zw','*content','*text','*txt','*nr','*chapter','*cont','*article','*read' ];
            for (let i = 0; i < contentReg.length; i++) {
              let tmp;
              if (contentReg[i].startsWith("*")) {
                let attr = contentReg[i].replace("*", "");
                tmp = $("[id*=" + attr + "]");
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
                let txt = $(tmp1).text();
                if(txt && txt.length < 150){
                  tmpTxt = txt;
                  continue;
                }
                if (txt) {
                  let reg = /(正文)?(第)([零〇一二三四五六七八九十百千万a-zA-Z0-9]{1,7})[章节卷集部篇回]((?! {4}).)((?!\t{1,4}).){0,30}\r?\n/g;
                  txt = txt.replace(reg,'').replace(/\s/g, "");
                  result = txt;
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
            return result;
          }
          $ = cheerio.load(_html);
          let title = '';
          if (task.rule && task.rule.chapter_title) {
            title = $(task.rule.chapter_title).text();
            if (!title) {
              logs += '<p style="color: red"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>获取章节标题失败，请检查您的json规则是否正确</p>';
              response.err_no = 2;
              response.err_info = '获取章节标题失败，请检查您的json规则是否正确';
            }
          } else {
            title = getChapterTitle();
            if (!title) {
              logs += '<p style="color: red"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>智能解析章节标题失败，可能暂未支持该网站</p>';
              response.err_no = 3;
              response.err_info = '智能解析章节标题失败，可能暂未支持该网站';
            }
          }
          if (!title) {
            response.log = logs;
            callback(response);
          } else {
            let content = '';
            if (task.rule && task.rule.chapter_content) {
              content = $(task.rule.chapter_content).text();
              if (!content) {
                logs += '<p style="color: red"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>获取章节正文失败，请检查您的json规则是否正确</p>';
                response.err_no = 3;
                response.err_info = '获取章节正文失败，请检查您的json规则是否正确';
              }
            } else {
              content = getChapterContent();
              if (!content) {
                logs += '<p style="color: red"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>智能解析章节正文失败，可能暂未支持该网站</p>';
                response.err_no = 4;
                response.err_info = '智能解析章节正文失败，可能暂未支持该网站';
              }
            }
            if (!content){
              response.log = logs;
              callback(response);
            } else {
              try {
                let fd = fs.openSync(path ,'a');
                fs.appendFileSync(fd,title+" \n");
                fs.appendFileSync(fd,content+" \n");
                fs.closeSync(fd);
                logs += '<p><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>章节【'+title+'】抓取成功</p>';
                response.path = path;
              } catch (e) {
                console.log(e);
                logs += '<p style="color: red"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>智能解析章节正文失败，可能暂未支持该网站</p>';
                response.err_no = 5;
                response.err_info = '记录保存章节内容出错';
              }
              response.log = logs;
              callback(response);
            }
          }
        }
      } else {
        console.log(err);
        logs += '<p style="color: red"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>访问章节地址出错，错误信息:'+err+'</p>';
        response.err_no = 99;
        response.err_info = '访问章节地址出错，错误信息:' + err;
        response.log = logs;
        callback(response);
      }
    });
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
      fs.renameSync(tmpPath,newPath);
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
        fs.unlinkSync(filePath);
      });
    } catch (e) {
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
    let encodingCheck = {};
    if (buf.byteLength > 8000) {
      let tmpBuffer = new Buffer(8000);
      buf.copy(tmpBuffer, 0, 0, 8000);
      encodingCheck = jschardet.detect(tmpBuffer);
      tmpBuffer = null;
    } else {
      encodingCheck = jschardet.detect(buf);
    }
    //用检查出来的编码将buffer转成字符串
    if (encodingCheck.confidence > 0.65) {
      return  iconv.decode(buf, encodingCheck.encoding);
    } else {
      return  iconv.decode(buf, 'utf-8');
    }
  }
}


