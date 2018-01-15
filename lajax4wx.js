/**
 * lajax4wx
 * log + ajax 前端日志解决方案 for微信小程序
 * Author: Sky.Sun
 * Date: 2017/09/06
 */

/**
 * 使 Error 对象支持 JSON 序列化
 */
if (!('toJSON' in Error.prototype)) {
    /* eslint-disable no-extend-native */
    Object.defineProperty(Error.prototype, 'toJSON', {
        value() {
            const alt = {};
            Object.getOwnPropertyNames(this).forEach(function (key) {
                alt[key] = this[key];
            }, this);
            return alt;
        },
        configurable: true,
        writable: true
    });
    /* eslint-enable no-extend-native */
}

class Lajax {
    /* eslint-disable no-console, no-bitwise*/
    constructor(param) {
        let config = param;
        if (typeof config === 'undefined') {
            throw new Error('lajax初始化错误 - 构造函数的参数不能为空！');
        }
        if (typeof config === 'object') {
            if (typeof param.url !== 'string') {
                throw new Error('lajax初始化错误 - 构造函数的参数 url 必须是一个字符串！');
            } else if (param.app == null) {
                throw new Error('lajax初始化错误 - 构造函数的参数 app 不能为空！');
            }
        } else {
            throw new Error('lajax初始化错误 - 构造函数的参数格式不正确！');
        }

        // 服务端 url 地址
        this.url = config.url;

        // 微信小程序实例，通过在 App() 函数内传入 this，或者调用 getApp() 获得
        this.app = config.app;

        // 是否自动记录未捕获错误
        this.autoLogError = config.autoLogError == null ? true : config.autoLogError;

        // 是否要格式化 console 打印的内容
        this.stylize = config.stylize == null ? true : config.stylize;

        // 默认的间隔发送时间（毫秒）
        const defaultInterval = 10000;

        // 间隔发送时间
        this.interval = config.interval == null ? defaultInterval : config.interval;

        // 默认的最大请求出错次数
        const defaultMaxErrorReq = 5;

        // 发送请求出错的最大次数，超过此次数则不再发送请求，但依然会记录请求到队列中
        this.maxErrorReq = config.maxErrorReq == null ? defaultMaxErrorReq : config.maxErrorReq;

        // 当前请求出错次数
        this.errorReq = 0;

        // 日志队列
        this.queue = [];

        // 发送日志请求的 request 对象
        this.requestTask = null;

        // 原始的 console 对象
        this.console = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error
        };

        // 初始化
        this._init();
    }

    /**
     * 初始化方法
     * 
     * @memberof Lajax
     */
    _init() {
        // 获取唯一请求id
        this._getReqId();

        // 加载之前未发送的历史日志
        this._loadFromStorage();

        // 自动记录异常
        this._exceptionHandler();

        // 绑定页面隐藏事件
        this._storageUnsendData();

        // 重写 console
        this._overwriteConsole();

        // 定时发送日志请求
        this.timer = setInterval(() => {
            this._send();
        }, this.interval);
    }

    /**
     * 获取或者生成唯一请求 id
     * 
     * @memberof Lajax
     */
    _getReqId() {
        const reqId = this.app.globalData.reqId;
        if (!reqId) {
            // 生成一个 reqId https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript/8809472#8809472
            let time = Date.now();
            if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
                // 使用更高精度的时间
                time += performance.now();
            }
            this.reqId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
                const rand = (time + (Math.random() * 16)) % 16 | 0;
                time = Math.floor(time / 16);
                return (char === 'x' ? rand : ((rand & 0x3) | 0x8)).toString(16);
            });
            this.app.globalData.reqId = this.reqId;
        }
    }

    /**
     * 从微信缓存加载之前未发送的历史日志
     * 
     * @memberof Lajax
     */
    _loadFromStorage() {
        let lastData = wx.getStorageSync('lajax');
        if (lastData) {
            lastData = JSON.parse(lastData);
            if (Array.isArray(lastData) && lastData.length) {
                this.lastUnsend = lastData.length;
                this.queue = lastData;

                // 立即发送一次
                this._send();
            }
            wx.removeStorageSync('lajax');
        }

    }

    /**
     * 自动记录异常
     * 
     * @memberof Lajax
     */
    _exceptionHandler() {
        // 页面未捕获异常
        if (this.autoLogError) {
            this.app.onError = err => {
                this.error('[OnError]', err.message, `(${err.lineno}行${err.colno}列)`);
            };
        }
    }

    /**
     * 解析 url
     * 
     * @param {string} url
     * @returns 
     * @memberof Lajax
     */
    _resolveUrl(url) {
        const link = document.createElement('a');
        link.href = url;
        return `${link.protocol}//${link.host}${link.pathname}${link.search}${link.hash}`;
    }

    /**
     * 页面隐藏前检查是否还有未发送的日志
     * 
     * @memberof Lajax
     */
    _storageUnsendData() {
        const originOnHide = this.app.onHide;
        this.app.onHide = () => {
            if (this.queue.length) {
                // 存入微信缓存，下次进入页面时会自动发送一次日志
                wx.setStorageSync('lajax', JSON.stringify(this.queue));
            }
            originOnHide();
        };

        const originOnShow = this.app.onShow;
        this.app.onShow = options => {
            this._loadFromStorage();
            originOnShow(options);
        };
    }

    /**
     * 发送日志请求
     * 
     * @memberof Lajax
     */
    _send() {
        const logCount = this.queue.length;
        if (logCount) {
            // 如果存在 this.requestTask，说明上一次的请求还没有结束，就又准备发送新的请求了，则直接终止上次请求
            if (this.requestTask) {
                this.requestTask.abort();
            }
            this.requestTask = wx.request({
                url: this.url,
                method: 'POST',
                data: JSON.stringify(this.queue),
                header: {
                    'content-type': 'application/json'
                },
                success: () => {
                    // 日志发送成功，从队列中去除已发送的
                    this.queue.splice(0, logCount);

                    // 重置请求出错次数
                    this.errorReq = 0;

                    // 显示日志发送成功
                    if (this.console) {
                        if (this.stylize) {
                            this.console.log(`%c[${this._getTimeString(null)}] - ${logCount}条日志发送成功！`, `color: ${Lajax.colorEnum.sendSuccess}`);
                        } else {
                            this.console.log(`${logCount}条日志发送成功！`);
                        }
                    }
                },
                fail: e => {
                    // 排除掉abort的错误
                    if (e.errMsg !== 'request:fail abort') {
                        this._printConsole(null, Lajax.levelEnum.error, `发送日志请求失败！配置的接口地址：${this.url} 错误描述：${e.errMsg}`);
                        this._checkErrorReq();
                    }
                },
                complete: () => {
                    this.xhr = null;
                }
            });
        }
    }

    /**
     * 检查请求出错次数
     * 
     * @memberof Lajax
     */
    _checkErrorReq() {
        // 将出错次数 +1
        this.errorReq++;

        // 超过最大次数则认为服务器不可用，停止定时器
        if (this.errorReq >= this.maxErrorReq) {
            clearInterval(this.timer);
            this._printConsole(null, Lajax.levelEnum.warn, `发送日志请求的连续失败次数过多，已停止发送日志。请检查日志接口 ${this.url} 是否正常！`);
        }
    }

    /**
     * 获取时间字符串
     * 
     * @param {Date} time - 记录时间 
     * @returns 
     * @memberof Lajax
     */
    _getTimeString(time) {
        const now = (time === null ? new Date() : time);

        // 时
        let hour = String(now.getHours());
        if (hour.length === 1) {
            hour = `0${hour}`;
        }

        // 分
        let minute = String(now.getMinutes());
        if (minute.length === 1) {
            minute = `0${minute}`;
        }

        // 秒
        let second = String(now.getSeconds());
        if (second.length === 1) {
            second = `0${second}`;
        }

        // 毫秒
        let millisecond = String(now.getMilliseconds());
        if (millisecond.length === 1) {
            millisecond = `00${millisecond}`;
        } else if (millisecond.length === 2) {
            millisecond = `0${millisecond}`;
        }

        return `${hour}:${minute}:${second}.${millisecond}`;
    }

    /**
     * 获取日期时间字符串
     * 
     * @param {Date} time - 记录时间
     * @returns 
     * @memberof Lajax
     */
    _getDateTimeString(time) {
        const now = (time === null ? new Date() : time);

        // 年
        const year = String(now.getFullYear());

        // 月
        let month = String(now.getMonth() + 1);
        if (month.length === 1) {
            month = `0${month}`;
        }

        // 日
        let day = String(now.getDate());
        if (day.length === 1) {
            day = `0${day}`;
        }

        return `${year}-${month}-${day} ${this._getTimeString(now)}`;
    }

    /**
     * 调用系统 console 打印日志
     * 
     * @param {any} time 
     * @param {any} level 
     * @param {any} args 
     * @memberof Lajax
     */
    _printConsole(time, level, ...args) {
        if (this.console) {
            args.unshift(`{${this.app.globalData.reqId}}`);
            if (this.stylize) {
                this.console[level](`%c[${this._getTimeString(time)}] [${level.toUpperCase()}] -`, `color: ${Lajax.colorEnum[level]}`, ...args);
            } else {
                this.console[level](...args);
            }
        }
    }

    /**
     * 将日志添加到队列中
     * 
     * @param {any} time 
     * @param {any} level 
     * @param {any} args 
     * @memberof Lajax
     */
    _pushToQueue(time, level, ...args) {
        args.unshift(`{${this.app.globalData.reqId}}`);
        let url = '';
        const pages = getCurrentPages();
        if (pages && pages.length > 0) {
            const page = pages[pages.length - 1];
            if (page.route) {
                url = page.route;
            }
        }
        this.queue.push({
            time: this._getDateTimeString(time),
            level,
            messages: args,
            url,
            agent: '微信小程序'
        });
    }

    /**
     * 将日志打印到控制台并添加到队列
     * 
     * @param {Date} time - 记录时间
     * @param {Lajax.levelEnum} level - 日志级别
     * @param {any} args - 日志内容
     * @memberof Lajax
     */
    _log(time, level, ...args) {
        // 调用系统 console 打印日志
        this._printConsole(time, level, ...args);

        // 将日志添加到队列中
        this._pushToQueue(time, level, ...args);
    }

    /**
     * 重写 console
     * 
     * @memberof Lajax
     */
    _overwriteConsole() {
        if (console) {
            // 记录一条信息日志
            console.info = (...args) => {
                this._log(null, Lajax.levelEnum.info, ...args);
            };

            // 记录一条普通日志
            console.log = (...args) => {
                this._log(null, Lajax.levelEnum.info, ...args);
            };

            // 记录一条警告日志
            console.warn = (...args) => {
                this._log(null, Lajax.levelEnum.warn, ...args);
            };

            // 记录一条错误日志
            console.error = (...args) => {
                this._log(null, Lajax.levelEnum.error, ...args);
            };
        }
    }
    /* eslint-enable no-console, no-bitwise*/
}

/**
 * 日志级别枚举
 */
Lajax.levelEnum = {
    /**
     * 信息
     */
    info: 'info',

    /**
     * 警告
     */
    warn: 'warn',

    /**
     * 错误
     */
    error: 'error',
};

/**
 * 日志颜色枚举
 */
Lajax.colorEnum = {
    /**
     * 信息日志颜色，默认宝蓝色
     */
    info: 'DodgerBlue',

    /**
     * 警告日志颜色，默认橘黄色
     */
    warn: 'orange',

    /**
     * 错误日志颜色，默认红色
     */
    error: 'red',

    /**
     * ajax分组颜色，默认紫色
     */
    ajaxGroup: '#800080',

    /**
     * 日志发送成功颜色，默认绿色
     */
    sendSuccess: 'green',

    /**
     * 描述文字颜色，默认粉红色
     */
    desc: '#d30775',
};

module.exports = {
    init: config => new Lajax(config)
};
