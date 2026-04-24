import React from 'react'
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles'
import {
  Backdrop, Box, Button, Card, CardActions, CardContent, Checkbox, CircularProgress, Dialog,
  DialogContent, DialogTitle, Divider, FormControlLabel, Grid, LinearProgress, Snackbar, TextField, Typography
} from '@material-ui/core';
import {HelpTwoTone, ExpandMore, ExpandLess} from "@material-ui/icons";


window.platform = {
  isMacOs: window.utools.isMacOs(),
  isWindows: window.utools.isWindows(),
  isLinux: window.utools.isLinux()
}

const themeDic = {
  light: createMuiTheme({
    palette: {
      type: 'light'
    },
    props: {
      MuiButtonBase: {
        disableRipple: true
      }
    }
  }),
  dark: createMuiTheme({
    palette: {
      type: 'dark',
      primary: {
        main: '#90caf9'
      },
      secondary: {
        main: '#f48fb1'
      }
    },
    props: {
      MuiButtonBase: {
        disableRipple: true
      }
    }
  })
}

let pauseFlag = {};

export default class App extends React.Component {

  disposedTask = {};
  detailListRef = React.createRef();

  state = {
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    bookUrl: null,
    concurrency: 3,
    startChapter: null,
    endChapter: null,
    headers: null,
    rule: null,
    filter: null,
    proxyPool: null,
    pageEnabled: false,
    nextPageSelector: '',
    nextPageHasText: '',
    nextPageNoText: '',
    tasks: [],
    msg: {
      show: false,
      text: ''
    },
    loading: {
      show: false,
      msg: ''
    },
    detail: {
      show: false,
      taskId: null
    },
    detailListScrollTop: 0,
    detailListHeight: 0,
    showHelp: false,
    isExpand: false,
  }

  /***  添加爬书任务  ***/
  addTask = () => {
    if(!this.state.bookUrl){
      this.showTip("请先填写书籍主页地址");
      return;
    }
    if(this.state.concurrency === null || this.state.concurrency === undefined || this.state.concurrency === ''){
      this.showTip("请先填写并发数");
      return;
    }
    if(!/^[0-9]+$/.test(String(this.state.concurrency))) {
      this.showTip("请填写正确的并发数（整数）");
      return;
    }
    let concurrency = Number(this.state.concurrency);
    if(concurrency < 1 || concurrency > 10){
      this.showTip("并发数范围为1到10");
      return;
    }
    let rule ;
    if(this.state.rule){
      if (this.isJSON(this.state.rule)) {
        rule = JSON.parse(this.state.rule);
        if(!rule.book_menu || !rule.book_name || !rule.chapter_title || !rule.chapter_content){
          this.showTip("抓取规则不正确，请检查规则四要素是否都有配置");
          return;
        }
      } else {
        this.showTip("抓取规则格式不正确，请检查");
        return;
      }
    }
    let filter;
    if(this.state.filter){
      if (this.isJSON(this.state.filter)) {
        filter = JSON.parse(this.state.filter);
        if(!filter || filter.length <= 0){
          this.showTip("过滤规则不正确，请检查规则json是否为数组格式");
          return;
        }
        let bad = false;
        filter.forEach((one) => {
          if (one === null || one === undefined) return;
          if (typeof one === 'string') return;
          if (typeof one === 'object') return;
          bad = true;
        });
        if (bad) {
          this.showTip("过滤规则不正确：数组元素需为字符串或对象");
          return;
        }
      } else {
        this.showTip("过滤规则格式不正确，请检查");
        return;
      }
    }
    let proxy;
    if(this.state.proxyPool){
      if (this.isJSON(this.state.proxyPool)) {
        proxy = JSON.parse(this.state.proxyPool);
        if(!proxy || proxy.length <= 0){
          this.showTip("代理设置不正确，请检查规则json是否为数组格式");
          return;
        }
      } else {
        this.showTip("代理格式不正确，请检查");
        return;
      }
    }
    let headers;
    if(this.state.headers){
      if (this.isJSON(this.state.headers)) {
        headers = JSON.parse(this.state.headers);
      } else {
        this.showTip("header参数格式不正确，请检查");
        return;
      }
    }
    let page = null;
    if (this.state.pageEnabled) {
      page = {
        enabled: true,
        nextSelector: this.state.nextPageSelector,
        nextHasText: this.state.nextPageHasText,
        nextNoText: this.state.nextPageNoText
      };
    }
    if(this.state.tasks){
      if(this.state.tasks.length >= 5){
        this.showTip("最多同时执行五个抓取任务，请稍后再试");
        return;
      }
      let flag = false;
      this.state.tasks.forEach((ele) => {
        if(ele.url && ele.url === this.state.bookUrl){
          this.showTip("该书籍已在爬取任务中，请勿重复添加");
          flag = true;
        }
      });
      if(flag){
        return;
      }
    }
    let self = this;
    self.showLoading();
    window.services.getTask(this.state.bookUrl, concurrency, this.state.startChapter, this.state.endChapter, headers ,rule, filter, proxy, page, (res) => {
      if(res.err_no === 0){
        let task = res.result;
        self.normalizeTask(task, { reset: true, concurrency });
        self.setState((prev) => ({
          tasks: [task, ...(prev.tasks || [])],
          bookUrl: '',
          rule: '',
          filter: '',
          startChapter: '',
          endChapter: '',
          headers: '',
          proxyPool: ''
        }), () => {
          self.runTask(task);
        });
      } else {
        self.showTip(res.err_info);
      }
      self.closeLoading();
    });
  }

  togglePageEnabled = (e) => {
    this.setState({ pageEnabled: !!(e && e.target && e.target.checked) });
  }

  clampConcurrency = (val) => {
    let num = Number(val);
    if (!Number.isFinite(num)) {
      return 1;
    }
    num = Math.floor(num);
    if (num < 1) return 1;
    if (num > 10) return 10;
    return num;
  }

  normalizeTask = (task, options = {}) => {
    if (!task) return;
    let total = task.menu && task.menu.length ? task.menu.length : 0;

    // 初始化新任务
    if (options.reset) {
      task.concurrency = this.clampConcurrency(options.concurrency ?? task.concurrency ?? 3);
      task.chapters = Array.from({length: total}).map(() => ({status: 0, title: '', err: ''}));
      task.queue = Array.from({length: total}).map((_, idx) => idx);
      task.runningCount = 0;
      task.successCount = 0;
      task.failCount = 0;
      task.requestCount = 0;
      task.status = 0;
      task.statusText = '任务处理中';
      task.progress = total > 0 ? '0' : '100';
      delete task.log;
      delete task.interval;
      delete task.curChapter;
      return;
    }

    // 兼容旧数据：interval/curChapter/log/status=4
    if (!task.concurrency) {
      task.concurrency = this.clampConcurrency(task.concurrency ?? 1);
    } else {
      task.concurrency = this.clampConcurrency(task.concurrency);
    }

    // 旧任务：把“中断”映射为“暂停”
    if (task.status === 4) {
      task.status = 1;
    }

    if (!Array.isArray(task.chapters) || task.chapters.length !== total) {
      let chapters = Array.from({length: total}).map(() => ({status: 0, title: '', err: ''}));
      let cur = Number(task.curChapter || 0);
      if (!Number.isFinite(cur) || cur < 0) cur = 0;
      cur = Math.min(cur, total);
      for (let i = 0; i < cur; i++) {
        chapters[i].status = 2;
      }
      // 原中断章节标记为失败（若存在）
      if (Number(task.curChapter) < total && task.statusText && task.statusText.indexOf('中断') !== -1) {
        chapters[Number(task.curChapter)].status = 3;
        chapters[Number(task.curChapter)].err = '历史任务中断，建议重试该章节';
      }
      task.chapters = chapters;
    }

    // 计数/队列
    if (typeof task.successCount !== 'number' || typeof task.failCount !== 'number') {
      let success = 0;
      let fail = 0;
      task.chapters.forEach((c) => {
        if (c.status === 2) success += 1;
        if (c.status === 3) fail += 1;
      });
      task.successCount = success;
      task.failCount = fail;
    }
    if (typeof task.runningCount !== 'number') {
      task.runningCount = 0;
    }
    if (!Array.isArray(task.queue)) {
      task.queue = [];
      for (let i = 0; i < total; i++) {
        if (task.chapters[i] && task.chapters[i].status === 0) {
          task.queue.push(i);
        }
      }
    }
    if (typeof task.requestCount !== 'number') {
      task.requestCount = (task.successCount || 0) + (task.failCount || 0);
    }
    delete task.log;
    delete task.interval;
    delete task.curChapter;

    this.refreshTaskProgress(task);
  }

  setChapterStatus = (task, chapterIndex, status, extra = {}) => {
    if (!task || !task.chapters || !task.chapters[chapterIndex]) return;
    const chapter = task.chapters[chapterIndex];
    const prev = chapter.status;
    if (prev === 2) task.successCount = Math.max(0, (task.successCount || 0) - 1);
    if (prev === 3) task.failCount = Math.max(0, (task.failCount || 0) - 1);
    chapter.status = status;
    if (status === 2) task.successCount = (task.successCount || 0) + 1;
    if (status === 3) task.failCount = (task.failCount || 0) + 1;
    Object.keys(extra).forEach((k) => {
      chapter[k] = extra[k];
    });
  }

  refreshTaskProgress = (task) => {
    if (!task || !task.menu) return;
    const total = task.menu.length || 0;
    const done = (task.successCount || 0) + (task.failCount || 0);
    task.progress = total > 0 ? (done / total * 100).toFixed(2) : '0';
    if (task.status === 0) {
      task.statusText = `任务处理中（成功${task.successCount || 0}章，失败${task.failCount || 0}章）`;
    } else if (task.status === 1) {
      task.statusText = `任务暂停中（成功${task.successCount || 0}章，失败${task.failCount || 0}章）`;
    } else if (task.status === 2) {
      task.statusText = `任务处理完成（成功${task.successCount || 0}章）`;
    } else if (task.status === 3) {
      task.statusText = `任务处理完成（成功${task.successCount || 0}章，失败${task.failCount || 0}章）`;
    }
  }

  updateTaskInState = (task, callback) => {
    if (!task || !task.id) return;
    this.setState((prev) => {
      const tasks = (prev.tasks || []).slice();
      const idx = tasks.findIndex((t) => t && t.id === task.id);
      if (idx >= 0) {
        tasks.splice(idx, 1, task);
      } else {
        tasks.unshift(task);
      }
      return { tasks };
    }, callback);
  }

  upsertTaskToDb = (task) => {
    try {
      const resDb = window.utools.db.get(window.utools.getNativeId() + "/tasks");
      if (!resDb) return;
      let tasks = resDb.data || [];

      // 不持久化运行态字段，避免体积/恢复问题
      let stored = JSON.parse(JSON.stringify(task));
      delete stored.queue;
      delete stored.runningCount;
      delete stored.requestCount;

      let findIt = false;
      if(tasks && tasks.length > 0){
        for (let i = 0; i < tasks.length; i++ ) {
          let ele = tasks[i];
          if(ele && ele.id === task.id){
            findIt = true;
            tasks.splice(i, 1, stored);
            break;
          }
        }
      }
      if(!findIt){
        tasks.unshift(stored);
      }
      resDb.data = tasks;
      window.utools.db.put(resDb);
    } catch (e) {
      console.log(e);
    }
  }

  removeTaskFromDb = (taskId) => {
    try {
      const resDb = window.utools.db.get(window.utools.getNativeId() + "/tasks");
      if (!resDb) return;
      let tasks = resDb.data || [];
      if(tasks && tasks.length > 0){
        for (let j = 0; j < tasks.length; j++ ) {
          let ele = tasks[j];
          if(ele && ele.id === taskId){
            tasks.splice(j, 1);
            break;
          }
        }
      }
      resDb.data = tasks;
      window.utools.db.put(resDb);
    } catch (e) {
      console.log(e);
    }
  }

  retryChapter = (task, chapterIndex) => {
    if (!task || !task.id) return;
    this.enqueueChapters(task, [chapterIndex]);
  }

  retryFailedChapters = (task) => {
    if (!task || !task.chapters) return;
    let failed = [];
    task.chapters.forEach((c, idx) => {
      if (c && c.status === 3) {
        failed.push(idx);
      }
    });
    this.enqueueChapters(task, failed);
  }

  enqueueChapters = (task, chapterIndexes) => {
    if (!task || !task.id || !task.chapters || !Array.isArray(chapterIndexes)) return;
    let enqueued = 0;
    task.queue = Array.isArray(task.queue) ? task.queue : [];

    chapterIndexes.forEach((idx) => {
      if (typeof idx !== 'number' || idx < 0 || idx >= task.chapters.length) return;
      let chapter = task.chapters[idx];
      if (!chapter) return;
      if (chapter.status === 1) return; // 处理中
      if (chapter.status === 0) return; // 已在队列
      if (chapter.status === 2) return; // 已成功
      // 失败 -> 重新入队
      this.setChapterStatus(task, idx, 0, {err: ''});
      task.queue.push(idx);
      enqueued += 1;
    });

    if (enqueued <= 0) {
      this.showTip("暂无可重爬的失败章节");
      return;
    }
    pauseFlag[task.id] = false;
    task.status = 0;
    this.refreshTaskProgress(task);
    this.updateTaskInState(task, () => {
      this.runTask(task);
    });
  }

  runTask = (task) => {
    if (!task || !task.id) return;
    if (this.disposedTask[task.id]) return;
    if (!task.menu || task.menu.length <= 0) return;
    if (!Array.isArray(task.chapters) || task.chapters.length !== task.menu.length) {
      this.normalizeTask(task);
    }
    task.concurrency = this.clampConcurrency(task.concurrency);
    task.queue = Array.isArray(task.queue) ? task.queue : [];
    task.runningCount = Number(task.runningCount || 0);

    // 暂停：只等在途结束，不再启动新章节
    if (pauseFlag[task.id]) {
      if (task.runningCount <= 0) {
        task.status = 1;
        this.refreshTaskProgress(task);
        this.upsertTaskToDb(task);
        this.updateTaskInState(task, () => {
          this.closeLoading();
        });
      }
      return;
    }

    let startedAny = false;
    while (task.runningCount < task.concurrency && task.queue.length > 0) {
      let idx = task.queue.shift();
      if (typeof idx !== 'number') continue;
      if (!task.chapters[idx]) continue;
      if (task.chapters[idx].status === 2 || task.chapters[idx].status === 1) {
        continue;
      }

      // 如果配置了代理池，每五个请求循环换一次代理
      if (task.requestCount !== 0 && task.proxy && task.proxy.length > 0 && task.requestCount % 5 === 0) {
        if(task.curProxyIndex === task.proxy.length - 1){
          task.curProxyIndex = 0;
        } else {
          task.curProxyIndex += 1;
        }
        task.curProxy = task.proxy[task.curProxyIndex];
      }
      task.requestCount = (task.requestCount || 0) + 1;

      this.setChapterStatus(task, idx, 1, {err: ''});
      task.runningCount += 1;
      startedAny = true;
      this.startChapter(task, idx);
    }

    if (startedAny) {
      this.refreshTaskProgress(task);
      this.updateTaskInState(task);
    }

    // 队列已空且无在途：任务结束（可能有失败）
    if (task.queue.length === 0 && task.runningCount === 0) {
      const total = task.menu.length;
      const done = (task.successCount || 0) + (task.failCount || 0);
      if (done >= total) {
        task.status = (task.failCount || 0) > 0 ? 3 : 2;
        this.refreshTaskProgress(task);
        this.upsertTaskToDb(task);
        this.updateTaskInState(task, () => {
          this.showTip(`《${task.name}》处理完成：成功${task.successCount || 0}章，失败${task.failCount || 0}章`);
        });
      }
    }
  }

  startChapter = (task, chapterIndex) => {
    if (!task || !task.id) return;
    window.services.getChapter(task, chapterIndex, (res) => {
      if (this.disposedTask[task.id]) {
        return;
      }
      task.runningCount = Math.max(0, Number(task.runningCount || 0) - 1);
      if (res && res.err_no === 0) {
        this.setChapterStatus(task, chapterIndex, 2, {title: res.title || '', err: ''});
      } else {
        this.setChapterStatus(task, chapterIndex, 3, {err: (res && res.err_info) ? res.err_info : '未知错误'});
      }
      this.refreshTaskProgress(task);
      this.updateTaskInState(task, () => {
        this.runTask(task);
      });
    });
  }
  /***  暂停或者恢复任务  ***/
  pauseTask = (e,task) => {
    if (!task || !task.id) {
      return;
    }
    if (pauseFlag[task.id] || task.status === 1) {
      // 恢复
      pauseFlag[task.id] = false;
      task.status = 0;
      task.statusText = '任务处理中';
      this.updateTaskInState(task, () => {
        this.runTask(task);
      });
    } else {
      // 暂停（不再启动新章节，等待在途请求结束）
      this.showLoading('正在暂停任务...');
      pauseFlag[task.id] = true;
      this.runTask(task);
    }
  }
  /***  保存文件或者删除任务  ***/
  saveTxt = (e,task,saveFlag) => {
    if (!task || !task.id) {
      return;
    }
    if(task.status === 2 || task.status === 3 || saveFlag){
      let separator = window.platform.isWindows ? "\u005C" : "/";
      let savePath = window.utools.showSaveDialog({title: '保存位置',defaultPath: window.utools.getPath('downloads') + separator + task.name + ".txt",buttonLabel: '保存'});
      if(!savePath){
        return;
      }
      let result = window.services.saveBook(task, savePath);
      if(result === 'ok'){
        window.services.deleteTemp(task.id);
        this.removeTaskFromDb(task.id);
        this.setState((prev) => ({
          tasks: (prev.tasks || []).filter((t) => t.id !== task.id),
          detail: prev.detail && prev.detail.taskId === task.id ? { show: false, taskId: null } : prev.detail
        }), () => {
          this.showTip("保存成功");
        });
      } else {
        this.showTip(result);
      }
    } else {
      // 删除任务
      this.disposedTask[task.id] = true;
      pauseFlag[task.id] = true;
      window.services.deleteTemp(task.id);
      this.removeTaskFromDb(task.id);
      this.setState((prev) => ({
        tasks: (prev.tasks || []).filter((t) => t.id !== task.id),
        detail: prev.detail && prev.detail.taskId === task.id ? { show: false, taskId: null } : prev.detail
      }), () => {
        this.showTip("删除成功");
      });
    }
  }
  /***  输入框change事件  ***/
  inputChange = (e) => {
    let state = this.state;
    state[e.target.getAttribute('id')] = e.target.value;
    this.setState(state);
  }
  /****   打开关闭等待层  ****/
  showLoading = (str,callback) => {
    let tmp = this.state.loading;
    tmp.show = true;
    tmp.msg = str;
    this.setState({loading : JSON.parse(JSON.stringify(tmp))});
  }
  closeLoading = () => {
    let tmp = this.state.loading;
    tmp.show = false;
    tmp.msg = '';
    this.setState({loading : JSON.parse(JSON.stringify(tmp))});
  }
  /****  打开关闭提示气泡  ****/
  showTip = (str) => {
    let self = this;
    self.state.msg = {show : true, text: str};
    this.setState({msg: JSON.parse(JSON.stringify(self.state.msg))});
  }
  hideTip = (e) => {
    let self = this;
    self.state.msg = {show : false, text: ''};
    this.setState({msg: JSON.parse(JSON.stringify(self.state.msg))});
  }
  /****  打开关闭任务详情  ****/
  openDetail = (e,task) => {
    if (!task || !task.id) {
      return;
    }
    this.setState({detail: {show : true, taskId: task.id}, detailListScrollTop: 0}, () => {
      setTimeout(() => {
        try {
          if (this.detailListRef && this.detailListRef.current) {
            let h = this.detailListRef.current.clientHeight;
            this.setState({detailListHeight: h || 0});
            this.detailListRef.current.scrollTop = 0;
          }
        } catch (err) {
          console.log(err);
        }
      }, 0);
    });
  }
  closeDetail = (e) => {
    this.setState({detail: {show : false, taskId: null}, detailListScrollTop: 0, detailListHeight: 0});
  }
  onDetailListScroll = (e) => {
    if (!e || !e.target) return;
    this.setState({detailListScrollTop: e.target.scrollTop});
  }
  /****   打开关闭使用说明  ****/
  showHelp = (e) => {
    this.setState({showHelp : true});
  }
  closeHelp = (e) => {
    this.setState({showHelp : false});
  }
  /****   展开和收起高级选项  ****/
  toggleExpand = () => {
    this.setState({isExpand : !this.state.isExpand});
  }
  /****   判断是否为json字符串  ****/
  isJSON = (str) => {
    if (typeof str == 'string') {
      try {
        let obj = JSON.parse(str);
        return !!(typeof obj === 'object' && obj);
      } catch(e) {
        console.log('error：' + str + '!!!' + e);
        return false;
      }
    } else {
      console.log('It is not a string!');
      return false;
    }
  }


  componentDidMount () {
    window.utools.onPluginEnter(enter => {

    })
    window.utools.onPluginReady(() => {
      //查询持久化的任务信息
      const res = window.utools.db.get(window.utools.getNativeId() + "/tasks");
      if(res){
        let tasks = res.data;
        if(tasks && tasks.length > 0){
          tasks.forEach((ele) => {
            if(!ele || !ele.id){
              return;
            }
            this.normalizeTask(ele);
            if(ele.status === 1){
              pauseFlag[ele.id] = true;
            }
          });
          this.setState({tasks: tasks});
        } else {
          window.services.emptyTempDir();
        }
      } else {
        let data = {
          _id : window.utools.getNativeId() + "/tasks",
          data : []
        }
        window.utools.db.put(data);
      }
    })
    window.utools.onPluginOut(() => {

    })
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      this.setState({ theme: e.matches ? 'dark' : 'light' })
    })
  }

  render () {
    const detailTask = this.state.detail && this.state.detail.show
      ? (this.state.tasks || []).find((t) => t && t.id === this.state.detail.taskId)
      : null;
    return (
      <ThemeProvider theme={themeDic[this.state.theme]}>
        <div className='app-page'>
          <Grid container spacing={1}>
            <Grid item xs={12} sm={6} style={{paddingRight:'0.8rem'}}>
              <TextField value={this.state.bookUrl} id="bookUrl" label="书籍主页地址" placeholder="请输入书籍首页的地址" fullWidth margin="normal"
                         InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={6} style={{paddingLeft:'0.8rem'}}>
              <TextField value={this.state.concurrency} id="concurrency" label="并发数" placeholder="请输入并发爬取章节数(1-10)" fullWidth margin="normal"
                         InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={6} style={{paddingRight:'0.8rem'}}>
              <TextField value={this.state.startChapter} id="startChapter" label="开始章节" placeholder="选填,请输入需要指定的开始爬取章节的名称" fullWidth margin="normal"
                         InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={6} style={{paddingRight:'0.8rem'}}>
              <TextField value={this.state.endChapter} id="endChapter" label="结束章节" placeholder="选填,请输入需要指定的结束爬取章节的名称" fullWidth margin="normal"
                         InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={12} style={{color:'#cacaca'}} hidden={this.state.isExpand}>
              <div style={{float:'right'}} onClick={this.toggleExpand}><ExpandMore style={{verticalAlign:'middle'}} /> 展开高级选项</div>
            </Grid>
            <Grid item xs={12} sm={12} style={{color:'#cacaca'}} hidden={!this.state.isExpand} >
              <div style={{float:'right'}} onClick={this.toggleExpand}><ExpandLess style={{verticalAlign:'middle'}} /> 收起高级选项</div>
            </Grid>
            <Grid item xs={12} sm={12} style={{paddingLeft:'0.8rem'}} hidden={!this.state.isExpand}>
              <TextField value={this.state.headers} id="headers" label="header参数" placeholder="选填,发送请求的header参数(json格式)" multiline fullWidth margin="normal"
                         maxRows={5} InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={12} hidden={!this.state.isExpand}>
              <TextField value={this.state.rule} id="rule" label="抓取规则" placeholder="选填,请输入该网站的抓取规则(json格式)" multiline fullWidth margin="normal"
                         maxRows={5} InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={12} hidden={!this.state.isExpand}>
              <TextField value={this.state.filter} id="filter" label="过滤规则" placeholder="选填,请输入该网站的正文过滤规则(json格式)" multiline fullWidth margin="normal"
                         maxRows={5} InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={12} hidden={!this.state.isExpand}>
              <TextField value={this.state.proxyPool} id="proxyPool" label="代理池" placeholder="选填,请输入要使用的代理列表(json格式)" multiline fullWidth margin="normal"
                         maxRows={5} InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={12} hidden={!this.state.isExpand} style={{paddingLeft:'0.8rem'}}>
              <FormControlLabel
                control={<Checkbox checked={this.state.pageEnabled} onChange={this.togglePageEnabled} color="primary" size="small"/>}
                label="章节内容分页"
              />
            </Grid>
            <Grid item xs={12} sm={12} hidden={!this.state.isExpand || !this.state.pageEnabled}>
              <TextField value={this.state.nextPageSelector} id="nextPageSelector" label="下一页按钮元素选择器" placeholder="选填,例如 .next a 或 #next" fullWidth margin="normal"
                         InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={12} hidden={!this.state.isExpand || !this.state.pageEnabled}>
              <TextField value={this.state.nextPageHasText} id="nextPageHasText" label="下一页按钮表示还有下一页的文字" placeholder="选填,例如 下一页 或 继续阅读" fullWidth margin="normal"
                         InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={12} hidden={!this.state.isExpand || !this.state.pageEnabled}>
              <TextField value={this.state.nextPageNoText} id="nextPageNoText" label="下一页按钮表示没有下一页了的文字" placeholder="选填,例如 下一章 或 已到末页" fullWidth margin="normal"
                         InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid container xs={12} justifyContent="center" style={{paddingTop:'1rem'}}>
              <Grid item xs={4} sm={2} >
                <Button  variant="contained" style={{width:'100%'}} onClick={this.addTask}>添加爬取任务</Button>
              </Grid>
            </Grid>
            <Grid container spacing={4} style={{marginTop:'2rem'}}>
              {(this.state.tasks || []).map((value) => (
                  <Grid key={value.id} item xs={6} sm={6} >
                    <Card variant="outlined">
                      <CardContent style={{padding:'7px 14px'}}>
                        <Typography  color="textSecondary" gutterBottom>
                          {value.name}
                        </Typography>
                        <Typography variant="button" className={'book-status'+value.status}>
                          {value.statusText}
                        </Typography>
                        <Box display="flex" alignItems="center" style={{margin:'0.9rem 0'}}>
                          <Box width="100%" mr={1}>
                            <LinearProgress variant="determinate" value={value.progress} />
                          </Box>
                          <Box minWidth={35}>
                            <Typography variant="body2" color="textSecondary">{value.progress+'%'}</Typography>
                          </Box>
                        </Box>
                      </CardContent>
                      <Divider />
                      <CardActions style={{padding:'4px 12px'}}>
                        <Button size="small" onClick={(e) => this.openDetail(e,value)}>查看详情</Button>
                        <Button size="small" style={{display: (value.status === 0 || value.status === 1) ? 'inline-flex':'none'}} color="primary" onClick={(e) => this.pauseTask(e,value)}>{pauseFlag[value.id] || value.status === 1 ? "恢复" : "暂停"}</Button>
                        <Button size="small" style={{display: value.status !== 1 ? 'none':'inline-flex'}} color={"primary"} onClick={(e) => this.saveTxt(e,value,true)}>保存</Button>
                        <Button size="small" style={{display: value.status === 0 ? 'none':'inline-flex'}} color={(value.status === 2 || value.status === 3) ? "primary" : "secondary"} onClick={(e) => this.saveTxt(e,value)}>{(value.status === 2 || value.status === 3) ? "保存" : "删除"}</Button>
                      </CardActions>
                    </Card>
                  </Grid>
              ))}
            </Grid>
          </Grid>
          <Dialog onClose={this.closeDetail} aria-labelledby="customized-dialog-title" open={this.state.detail.show} maxWidth="md" fullWidth>
            <DialogTitle id="customized-dialog-title" style={{padding:'8px 20px',textAlign:'center'}}>
              {detailTask ? ('《' + detailTask.name + '》章节列表') : '章节列表'}
            </DialogTitle>
            <DialogContent dividers style={{fontSize:'0.8rem',padding:'8px 20px'}}>
              {!detailTask ? null : (
                <div>
                  <Box display="flex" alignItems="center" justifyContent="space-between" style={{marginBottom:'0.6rem'}}>
                    <Typography variant="body2" color="textSecondary">
                      {`总章数：${detailTask.menu.length} ｜ 并发数：${detailTask.concurrency || 1} ｜ 成功：${detailTask.successCount || 0} ｜ 失败：${detailTask.failCount || 0}`}
                    </Typography>
                    <Button size="small" color="primary" disabled={(detailTask.failCount || 0) <= 0} onClick={() => this.retryFailedChapters(detailTask)}>
                      重爬全部失败章节
                    </Button>
                  </Box>
                  <Divider />
                  {(() => {
                    const total = detailTask.menu.length;
                    const chapterRowHeight = 44;
                    const errorRowHeight = 22;
                    const height = this.state.detailListHeight || 520;
                    const scrollTop = this.state.detailListScrollTop || 0;

                    // 展开为“章节行 +（可选）错误行”，错误行单独占一行；无错误则不占空间
                    let items = [];
                    for (let i = 0; i < total; i++) {
                      items.push({ type: 'chapter', idx: i });
                      let c = detailTask.chapters && detailTask.chapters[i] ? detailTask.chapters[i] : null;
                      if (c && c.status === 3 && c.err) {
                        items.push({ type: 'error', idx: i });
                      }
                    }
                    const getItemHeight = (it) => it.type === 'error' ? errorRowHeight : chapterRowHeight;

                    // prefix sums: top position for each item
                    let tops = new Array(items.length);
                    let totalHeight = 0;
                    for (let i = 0; i < items.length; i++) {
                      tops[i] = totalHeight;
                      totalHeight += getItemHeight(items[i]);
                    }

                    const upperBound = (arr, value) => {
                      let l = 0, r = arr.length;
                      while (l < r) {
                        let m = (l + r) >> 1;
                        if (arr[m] <= value) l = m + 1;
                        else r = m;
                      }
                      return l;
                    };

                    const buffer = 20;
                    let start = Math.max(0, upperBound(tops, scrollTop) - 1 - buffer);
                    let end = Math.min(items.length, upperBound(tops, scrollTop + height) + buffer);

                    let rows = [];
                    for (let i = start; i < end; i++) {
                      let it = items[i];
                      let top = tops[i];
                      let h = getItemHeight(it);
                      let idx = it.idx;
                      let url = detailTask.menu[idx];
                      let chapter = detailTask.chapters && detailTask.chapters[idx] ? detailTask.chapters[idx] : {status: 0, title: '', err: ''};

                      if (it.type === 'error') {
                        rows.push(
                          <div
                            key={'e_' + idx}
                            className="chapter-error-row"
                            style={{ position:'absolute', top: top, left: 0, right: 0, height: h }}
                            title={chapter.err || ''}
                          >
                            {chapter.err || ''}
                          </div>
                        );
                        continue;
                      }

                      let statusText = '待处理';
                      if (chapter.status === 1) statusText = '处理中';
                      if (chapter.status === 2) statusText = '完成';
                      if (chapter.status === 3) statusText = '失败';
                      let showRetry = chapter.status === 3;
                      let hasError = chapter.status === 3 && !!chapter.err;
                      let menuTitle = detailTask.menuTitle && detailTask.menuTitle[idx] ? detailTask.menuTitle[idx] : '';
                      // 章节标题按原网站目录页原样展示：优先使用目录标题
                      let titleOrUrl = menuTitle ? menuTitle : (chapter.title ? chapter.title : url);
                      let displayTitle = titleOrUrl;

                      rows.push(
                        <div
                          key={'c_' + idx}
                          className={'chapter-row' + (hasError ? ' chapter-row--has-error' : '')}
                          style={{ position:'absolute', top: top, left: 0, right: 0, height: h }}
                        >
                          <div className="chapter-col-title">
                            <span className="chapter-index-badge">{idx + 1}</span>
                            <span className="chapter-title-text" title={displayTitle}>{displayTitle}</span>
                          </div>
                          <div className="chapter-col-status">
                            <span className={chapter.status === 2 ? 'book-status2' : (chapter.status === 3 ? 'book-status4' : (chapter.status === 1 ? 'book-status1' : ''))}>
                              {statusText}
                            </span>
                          </div>
                          <div className="chapter-col-action">
                            {!showRetry ? null : (
                              <Button size="small" color="primary" onClick={() => this.retryChapter(detailTask, idx)}>重爬</Button>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div
                        ref={this.detailListRef}
                        onScroll={this.onDetailListScroll}
                        style={{height:'60vh',maxHeight:'60vh',overflow:'auto', position:'relative'}}
                      >
                        <div style={{height: totalHeight, position:'relative'}}>
                          {rows}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </DialogContent>
          </Dialog>
          <Dialog onClose={this.closeHelp} aria-labelledby="customized-dialog-title" open={this.state.showHelp}>
            <DialogTitle id="customized-dialog-title" style={{padding:'8px 20px',textAlign:'center'}}>使用说明</DialogTitle>
            <DialogContent dividers>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>插件介绍</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;自动爬取小说网站上的内容，生成txt文件保存到本地。 ps：使用utools插件市场的另一款插件《摸鱼阅读》来阅读txt格式的小说体验更佳哦。
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>书籍主页地址</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;书籍首页的链接，带所有章节列表的页面。
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>并发数</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;并发数表示同一时间并发爬取多少个章节，范围为1到10。并发数越大速度越快，但也更容易触发网站的反爬机制，建议根据网站情况自行调整。
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>开始章节/结束章节</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;开始章节：这是一个非必填项，插件默认是从第一章开始爬取。但是如果之前的章节你已经看过了，只需要从特定的章节开始爬取，那么在此项填入你需要的开始章节的名称即可。 比如 "第十一章 少女和飞剑" ，或者 "少女和飞剑"
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;结束章节：同上，抓取任务抓取到您定义的结束章节后，抓取任务状态会变为成功。
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>header参数</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;这是一个非必填项，主要用于保存登陆状态，以爬取一些你已经购买过的收费网站的收费章节。
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;基本上所有收费网站的收费章节，未登录或购买的情况下都只展示开头的几十个字，登陆并且购买之后才能正常阅读。 header参数就是为了保存你的登陆状态的，大部分网站的登陆状态是通过cookie来保存，所以你可以在header参数里面配置上你登陆之后的cookie，以正常爬取已购买章节。
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;header参数示例如下：
                <br/>
                <pre>
                  <code>
                    <p style={{margin:0}}>{"  {"}</p>
                    <p style={{margin:0}}><span style={{color:'#f8c555'}}>    "cookie"</span>:<span style={{color:'#7ec699'}}> "_yep_uuid=2e2a1-ae3e; e1=%7B; ***** openid=7D3C"</span>,</p>
                    <p style={{margin:0}}><span style={{color:'#f8c555'}}>    "User-Agent"</span>:<span style={{color:'#7ec699'}}> "Mozilla/5.0 *** Chrome/96 Safari/537.36"</span></p>
                    <p style={{margin:0}}>{"  }"}</p>
                  </code>
                </pre>
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>爬取规则</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;这是一个非必填项，填写后插件将按照你填写的规则去爬取网站内容。若不填则由插件智能去识别网站信息并爬取内容。若提示智能识别失败，那只能说明插件还不够智能，你可以把你需要爬取的网址提交给我，我会优化插件以支持更多的网站。
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;爬取规则分为四个部分，书名、章节目录列表、章节标题、章节内容。只能使用jquery选择器来定义规则。请删除json中的注释后再粘贴到输入框中。
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;爬取规则示例如下：
                <br/>
                <pre>
                  <code>
                    <p style={{margin:0}}>{"  {"}</p>
                    <p style={{margin:0,color:'#979798'}}>{"    //书名"}</p>
                    <p style={{margin:0}}><span style={{color:'#f8c555'}}>    "book_name"</span>:<span style={{color:'#7ec699'}}> ".header h1"</span>,</p>
                    <p style={{margin:0,color:'#979798'}}>{"    //章节目录列表，选择器定位到a标签"}</p>
                    <p style={{margin:0}}><span style={{color:'#f8c555'}}>    "book_menu"</span>:<span style={{color:'#7ec699'}}> "#content ul li a"</span>,</p>
                    <p style={{margin:0,color:'#979798'}}>{"    //每一个章节的标题"}</p>
                    <p style={{margin:0}}><span style={{color:'#f8c555'}}>    "chapter_title"</span>:<span style={{color:'#7ec699'}}> "#title h1"</span>,</p>
                    <p style={{margin:0,color:'#979798'}}>{"    //章节正文内容"}</p>
                    <p style={{margin:0}}><span style={{color:'#f8c555'}}>    "chapter_content"</span>:<span style={{color:'#7ec699'}}> "#content"</span></p>
                    <p style={{margin:0}}>{"  }"}</p>
                  </code>
                </pre>
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>过滤规则</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;这是一个非必填项，填写后，插件爬取章节正文时会过滤掉规则中的内容。过滤规则支持两种写法：纯文本、正则表达式。
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;很多网站的章节正文中会加入一些烦人的广告文字，比如 "请记住本书首发域名：xxx.com"、"最新网址：yyy.com" 。这些与小说无关的内容非常影响阅读体验，所以可以把这些文字添加到过滤规则中，爬取时会自动删除。
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;注意：过滤规则是 JSON 数组。若使用正则表达式，推荐写成字符串形式的 <span style={{color:'#7ec699'}}>{'"/pattern/flags"'}</span> 或对象形式 <span style={{color:'#7ec699'}}>{'{"pattern":"...","flags":"g"}'}</span>。在 JSON 中反斜杠需要转义，写成 <span style={{color:'#7ec699'}}>{'\\\\'}</span>。
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;过滤规则示例如下（纯文本 + 正则混用）：
                <br/>
                <pre>
                  <code>
                    <p style={{margin:0}}>{"  ["}</p>
                    <p style={{margin:0}}><span style={{color:'#7ec699'}}>    "请记住本书首发域名：xxx.com"</span>,</p>
                    <p style={{margin:0}}><span style={{color:'#7ec699'}}>    "/最新网址：\\S+/g"</span>,</p>
                    <p style={{margin:0}}><span style={{color:'#7ec699'}}>    {"{\"pattern\":\"请记住本书首发域名：.*\",\"flags\":\"g\"}"}</span>,</p>
                    <p style={{margin:0}}><span style={{color:'#7ec699'}}>{'    "/\\\\n{2,}/g"'}</span></p>
                    <p style={{margin:0}}>{"  ]"}</p>
                  </code>
                </pre>
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>代理池</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;这是一个非必填项，填写后，插件会循环使用配置的代理池中的代理去爬取章节。设计此功能是因为很多网站会根据ip反爬，请求过于频繁会被封ip，而使用几个代理循环去调用的话，被封ip的几率会大大降低。
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;注意，代理池使用规则为： 本机直连和配置的所有代理加在一起形成一个池子，循环使用池子中的配置发送请求，每发5次章节请求循环一次
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;请确保配置的代理池中的所有代理都是有效的，并且支持http、https协议的。代理规则示例如下：
                <br/>
                <pre>
                  <code>
                    <p style={{margin:0}}>{"  ["}</p>
                    <p style={{margin:0}}><span style={{color:'#7ec699'}}>    "137.12.5.7:2345"</span>,</p>
                    <p style={{margin:0}}><span style={{color:'#7ec699'}}>    "178.42.6.147:4567"</span>,</p>
                    <p style={{margin:0}}><span style={{color:'#7ec699'}}>    "123.134.10.65:3128"</span></p>
                    <p style={{margin:0}}>{"  ]"}</p>
                  </code>
                </pre>
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>章节内容分页</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;部分网站的一个章节会分多页展示。勾选此选项后，插件会从章节第一页开始爬取正文，然后在当前页中寻找“下一页”的链接，递归爬取直到没有下一页为止。只有当该章节的所有分页都成功获取后，才会保存这一章节，否则该章节会标记为失败。
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;若你不填写分页相关的三个配置项，插件会默认在页面中寻找：文本包含“下一页”且总字数不超过10个的 a 标签，并取其 href 作为下一页链接，直到找不到为止。
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;若你填写了分页配置项，则会优先按你填写的选择器/文字规则来判定是否有下一页以及下一页链接如何获取。
              </Typography>
            </DialogContent>
          </Dialog>
          <HelpTwoTone className='help-icon' onClick={this.showHelp}/>
          <Backdrop open={this.state.loading.show}  className="app-loading" >
            <Typography hidden={!this.state.loading.msg} style={{marginRight:'0.8rem'}}>{this.state.loading.msg}</Typography>
            <CircularProgress color="inherit" style={{width:'30px',height:'30px'}}/>
          </Backdrop>
          <Snackbar anchorOrigin={{vertical: 'top',horizontal: 'center',}} open={this.state.msg.show} autoHideDuration={2000} onClose={this.hideTip} message={this.state.msg.text}/>
        </div>
      </ThemeProvider>
    )
  }
}
