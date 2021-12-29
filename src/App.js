import React from 'react'
import { createMuiTheme, ThemeProvider } from '@material-ui/core/styles'
import {
  Backdrop,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider,
  Grid,
  LinearProgress,
  Snackbar,
  TextField,
  Typography
} from '@material-ui/core';
import {HelpTwoTone} from "@material-ui/icons";


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
let scrollFlag = true;

export default class App extends React.Component {

  state = {
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    bookUrl: null,
    interval: null,
    rule: null,
    tasks: [],
    msg: {
      show: false,
      text: ''
    },
    loading: {
      show: false,
      msg: ''
    },
    log: {
      show: false,
      id: null,
      task: []
    },
    showHelp: false
  }

  /***  添加爬书任务  ***/
  addTask = () => {
    if(!this.state.bookUrl){
      this.showTip("请先填写书籍主页地址");
      return;
    }
    if(!this.state.interval ){
      this.showTip("请先填写间隔时间");
      return;
    }
    if(!/^[0-9]+.?[0-9]*/.test(this.state.interval)) {
      this.showTip("请填写正确的间隔时间（数字）");
      return;
    }
    if(this.state.interval < 200){
      this.showTip("间隔时间最少200毫秒");
      return;
    }
    let rule ;
    if(this.state.rule){
      try {
        rule = JSON.parse(this.state.rule);
        if(!rule.book_menu || !rule.book_name || !rule.chapter_title || !rule.chapter_content){
          this.showTip("爬书规则不正确，请检查规则四要素是否都有配置");
          return;
        }
      } catch (e) {
        this.showTip("爬书规则格式不正确，请检查");
        return;
      }
    }
    if(this.state.tasks){
      if(this.state.tasks.length >= 3){
        this.showTip("最多同时执行三个抓取任务，请稍后再试");
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
    let interval = Number(this.state.interval);
    if(this.state.tasks.length === 1 && Number(this.state.interval) > 300){
      interval = 300;
    } else if (this.state.tasks.length === 2 && Number(this.state.interval) > 400){
      interval = 400;
    }
    window.services.getTask(this.state.bookUrl, interval ,rule,(res) => {
      if(res.err_no === 0){
        let tasks = self.state.tasks;
        tasks.unshift(res.result);
        console.log(res.result);
        self.setState({tasks:JSON.parse(JSON.stringify(tasks))}, () => {
          self.state.bookUrl = '';
          self.state.rule = '';
          self.state.interval = '';
          self.getOneChapter(res.result);
        });
      } else {
        self.showTip(res.err_info);
        console.log(res);
      }
      self.closeLoading();
    });
  }
  /***  爬取一个章节并且更新状态  ***/
  getOneChapter = (task) => {
    if(task && task.menu && task.menu.length > 0){
      let self = this;
      if(task.curChapter < task.menu.length){
        window.services.getChapter(task, (res) => {
          task.log += res.log;
          if(res.err_no === 0){
            task.curChapter ++;
            task.progress = (task.curChapter/task.menu.length * 100).toFixed(2);
            if(task.curChapter === task.menu.length){
              //爬取完成
              task.status = 2;
              task.statusText = '任务处理完成';
              task.log += '<p style="color: rgba(155,223,51,0.83)"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>书籍爬取完成</p>';
            }
          } else {
            task.status = 4;
            task.statusText = '任务处理中断';
            if(pauseFlag[task.id]){
              self.closeLoading();
            }
          }
          if(task.status === 0 && pauseFlag[task.id]){
            task.status = 1;
            task.statusText = '任务暂停中';
            task.log += '<p style="color: #a4a442"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>任务已暂停</p>';
            self.closeLoading();
          }
          let state = self.state;
          state.tasks.forEach((oneTask,idx) => {
            if(oneTask.id === task.id){
              state.tasks.splice(idx, 1, task);
              if(state.log.show && state.log.id === task.id){
                state.log.task = task;
              }
              self.setState( JSON.parse(JSON.stringify(state)) ,() => {
                if(state.log.show && scrollFlag){
                  setTimeout(() => {
                    if(document.getElementById("logContent")){
                      document.getElementById("logContent").scrollTop = document.getElementById("logContent").scrollHeight;
                    }
                  },50);
                }
                if(task.status === 0){
                  setTimeout(() => {
                    self.getOneChapter(task);
                  },task.interval);
                }
              });
            }
          });
        });
      }
    }
  }
  /***  暂停或者恢复任务  ***/
  pauseTask = (e,task) => {
    let self = this;
    let state = self.state;
    state.tasks.forEach((oneTask,idx) => {
      if (oneTask.id === task.id) {
        if(pauseFlag[task.id] || task.status === 4){
          //暂停或者中断状态执行恢复操作
          pauseFlag[task.id] = false;
          task.status = 0;
          task.statusText = '任务处理中';
          task.log += '<p style="color: green"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>任务已恢复</p>';
          state.tasks.splice(idx, 1, task);
          self.setState( JSON.parse(JSON.stringify(state)), () => {
            self.getOneChapter(task);
          });
        } else {
          //暂停
          self.showLoading();
          pauseFlag[task.id] = true;
        }
      }
    });
  }
  /***  跳过当前章节  ***/
  skipChapter = (e,task) => {
    let self = this;
    let state = self.state;
    state.tasks.forEach((oneTask,idx) => {
      if (oneTask.id === task.id) {
        if(task.status === 4){
          task.log += '<p style="color: #14bfdb"><span style="margin-right: 4px;padding: 1px 3px;border-radius: 2px;background: #cacaca45;">'+ new Date().format("yyyy-MM-dd hh:mm:ss")+'</span>已跳过地址为【'+ task.menu[task.curChapter] +'】的章节</p>';
          task.curChapter ++;
          state.tasks.splice(idx, 1, task);
          self.setState( JSON.parse(JSON.stringify(state)), () => {
            self.pauseTask(null, task);
          });
        }
      }
    });
  }
  /***  保存文件或者删除任务  ***/
  saveTxt = (e,task) => {
    let self = this;
    let state = self.state;
    if(task.status === 2){
      let separator = window.platform.isWindows ? "\u005C" : "/";
      let savePath = window.utools.showSaveDialog({title: '保存位置',defaultPath: window.utools.getPath('downloads') + separator + task.name + ".txt",buttonLabel: '保存'});
      if(savePath){
        for (let i = 0; i < state.tasks.length; i++) {
          let oneTask = state.tasks[i];
          if (oneTask.id === task.id) {
            let path = window.utools.getPath("temp") + separator + "scan-book" + separator + task.id + '.txt';
            let result = window.services.saveFile(path,savePath);
            if(result === 'ok'){
              self.showTip("保存成功");
              state.tasks.splice(i,1);
            } else {
              self.showTip(result);
            }
            break;
          }
        }
      }
    } else {
      for (let i = 0; i < state.tasks.length; i++) {
        let oneTask = state.tasks[i];
        if (oneTask.id === task.id) {
          state.tasks.splice(i,1);
          self.showTip("删除成功");
          break;
        }
      }
    }
    self.setState( JSON.parse(JSON.stringify(state)));
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
  /****  打开关闭任务日志  ****/
  handleScroll = () => {
    const { scrollHeight, scrollTop, clientHeight } = document.getElementById("logContent");
    if (scrollHeight - scrollTop === clientHeight) {
      scrollFlag = true;
    } else if (scrollHeight - scrollTop > clientHeight + 130) {
      scrollFlag = false;
    }

  }
  showLog = (e,task) => {
    let self = this;
    self.state.log = {show : true, id: task.id , task: task};
    this.setState({log: JSON.parse(JSON.stringify(self.state.log))},() => {
      setTimeout(() => {
        document.getElementById("logContent").addEventListener('scroll', self.handleScroll);
      },100);
    });
  }
  closeLog = (e) => {
    let self = this;
    self.state.log = {show : false, id: null, task: []};
    this.setState({log: JSON.parse(JSON.stringify(self.state.log))}, () => {
      document.getElementById("logContent").removeEventListener('scroll', self.handleScroll);
    });
  }
  /****   打开关闭使用说明  ****/
  showHelp = (e) => {
    this.setState({showHelp : true});
  }
  closeHelp = (e) => {
    this.setState({showHelp : false});
  }


  componentDidMount () {
    window.utools.onPluginEnter(enter => {

    })
    window.utools.onPluginReady(() => {
      window.services.emptyTempDir();
    })
    window.utools.onPluginOut(() => {

    })
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      this.setState({ theme: e.matches ? 'dark' : 'light' })
    })
  }

  render () {
    return (
      <ThemeProvider theme={themeDic[this.state.theme]}>
        <div className='app-page'>
          <Grid container spacing={1}>
            <Grid item xs={12} sm={6} style={{paddingRight:'0.8rem'}}>
              <TextField value={this.state.bookUrl} id="bookUrl" label="书籍主页地址" placeholder="请输入书籍首页的地址" fullWidth margin="normal"
                         InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={6} style={{paddingLeft:'0.8rem'}}>
              <TextField value={this.state.interval} id="interval" label="间隔时间" placeholder="请输入爬取每章内容的间隔时间(毫秒)" fullWidth margin="normal"
                         InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid item xs={12} sm={12}>
              <TextField value={this.state.rule} id="rule" label="抓取规则" placeholder="选填,请输入该网站的抓取规则(json格式)" multiline fullWidth margin="normal"
                         maxRows={6} InputLabelProps={{shrink: true}} onChange={(e) => this.inputChange(e)}/>
            </Grid>
            <Grid container xs={12} justifyContent="center" style={{paddingTop:'1rem'}}>
              <Grid item xs={4} sm={2} >
                <Button  variant="contained" style={{width:'100%'}} onClick={this.addTask}>添加爬取任务</Button>
              </Grid>
            </Grid>
            <Grid container spacing={4} style={{marginTop:'2rem'}}>
              {this.state.tasks.map((value) => (
                  <Grid item xs={6} sm={6} >
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
                        <Button size="small" onClick={(e) => this.showLog(e,value)}>查看详情</Button>
                        <Button size="small" style={{display: value.status === 2 ? 'none':'inline-flex'}} color="primary" onClick={(e) => this.pauseTask(e,value)}>{pauseFlag[value.id] || value.status === 4 ? "恢复" : "暂停"}</Button>
                        <Button size="small" style={{display: value.status !== 4 ? 'none':'inline-flex'}} color="primary" onClick={(e) => this.skipChapter(e,value)}>跳过此章</Button>
                        <Button size="small" style={{display: value.status === 0 ? 'none':'inline-flex'}} color={value.status === 2 ? "primary" : "secondary"} onClick={(e) => this.saveTxt(e,value)}>{value.status === 2 ? "保存" : "删除"}</Button>
                      </CardActions>
                    </Card>
                  </Grid>
              ))}
            </Grid>
          </Grid>
          <Dialog onClose={this.closeLog} aria-labelledby="customized-dialog-title" open={this.state.log.show}>
            <DialogTitle id="customized-dialog-title" style={{padding:'8px 20px',textAlign:'center'}}>{'《'+ this.state.log.task.name +'》任务执行日志'}</DialogTitle>
            <DialogContent dividers id='logContent' style={{fontSize:'0.75rem',padding:'8px 20px'}}>
              <div dangerouslySetInnerHTML={{__html: this.state.log.task.log}} />
            </DialogContent>
          </Dialog>
          <Dialog onClose={this.closeHelp} aria-labelledby="customized-dialog-title" open={this.state.showHelp}>
            <DialogTitle id="customized-dialog-title" style={{padding:'8px 20px',textAlign:'center'}}>使用说明</DialogTitle>
            <DialogContent dividers>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>插件介绍</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;自动爬取小说网站上的内容，生成txt文件保存到本地。 ps：可以用utools插件市场的另一款插件《摸鱼阅读》来阅读txt格式的小说哦。
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>书籍主页地址</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;书籍首页的链接，带所有章节列表的页面。
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>间隔时间</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;大部分的网站为了防止被攻击，都会设置拦截器防止连续请求，所以设置一个爬取间隔时间是非常有必要的。单位为毫秒，最小值为200毫秒。
              </Typography>
              <Typography gutterBottom>
                <b style={{color:'#d25353'}}>爬取规则</b>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;这是一个非必填项，填写后插件将按照你填写的规则去爬取网站内容。若不填则由插件智能去识别网站信息并爬取内容。若提示智能识别失败，那只能说明插件还不够智能，你可以把你需要爬取的网址提交给我，我会优化插件以支持更多的网站。
                <br/>
                <br/>
                &nbsp;&nbsp;&nbsp;&nbsp;爬取规则分为四个部分，书名、章节目录列表、章节标题、章节内容。只能使用jquery选择器来定义规则。请删除json中的注释后再粘贴到输入框中。
                <br/>
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
