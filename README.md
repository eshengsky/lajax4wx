# lajax4wx
[lajax](https://github.com/eshengsky/lajax) 微信小程序版。

## 功能特性

* 手动记录日志，重写了 `console` 对象的 `log`，`info`，`warn`，`error` 方法；

* 日志会以优化后的格式打印在浏览器控制台；

* 自动记录小程序内脚本错误，或者 api 调用失败；

* 自动生成 [请求id](#请求id)，方便日志定位和关联；

* 日志会定时批量发送到配置的日志服务器。

## 快速开始

### 下载

在 [release](https://github.com/eshengsky/lajax4wx/releases) 页面下载压缩包。

### 使用

* 如果你希望在整个小程序内开启，可以在 `app.js` 顶部引入插件，并在 `onLaunch` 方法内进行初始化操作：
```js
var lajax = require('./lajax4wx');

App({
    onLaunch: functon() {
        // 其它代码...

        lajax.init({
            url: 'https://path/to/your/log/server',
            app: this
        });
    }
});
```

* 如果你只想在某些页面启用，在小程序 `pages` 下的对应目录的脚本文件中引入并初始化：
```js
var lajax = require('./lajax4wx');
lajax.init({
    url: 'https://path/to/your/log/server',
    app: getApp()
});
```

* 直接使用 `console` 的相应方法记录日志即可：
```js
// 记录一条警告日志
console.warn('这是一条警告日志！');

try {
    JSON.parse(undefined);
} catch(err) {
    // 记录一条错误日志
    console.error('这是一条error日志', '捕获到一个错误：', err);
}
```

## Api

### init(Options)

初始化插件方法。

`Options`: 参数组成的对象：

```js
lajax.init({
    url: 'https://path/to/your/log/server',
    app: getApp(),
    interval: 5000
});
```

对象支持的全部属性如下：

<table>
    <tr>
        <th>属性名</th>
        <th>说明</th>
        <th>值类型</th>
        <th>默认值</th>
    </tr>
    <tr>
        <td>url</td>
        <td>日志服务器的 URL</td>
        <td>string</td>
        <td>null</td>
    </tr>
    <tr>
        <td>autoLogError</td>
        <td>是否自动记录小程序内脚本错误，或者 api 调用失败</td>
        <td>boolean</td>
        <td>true</td>
    </tr>
    <tr>
        <td>stylize</td>
        <td>是否要格式化 console 打印的内容</td>
        <td>boolean</td>
        <td>true</td>
    </tr>
    <tr>
        <td>interval</td>
        <td>日志发送到服务端的间隔时间（毫秒）</td>
        <td>number</td>
        <td>10000</td>
    </tr>
    <tr>
        <td>maxErrorReq</td>
        <td>发送日志请求连续出错的最大次数，超过此次数则不再发送请求（但依然会记录请求到队列中）</td>
        <td>number</td>
        <td>5</td>
    </tr>
</table>

## 日志格式

通过 ajax 发送给服务器的日志，一定是一个非空数组。这里同时记录 2 条日志：

```js
console.info('这是一条info日志', 'Hello', 'lajax');
console.warn('这是一条warn日志');
```

实际发送的日志数据将如下：

```json
[{ 
    "time": "2017-08-23 16:35:01.989", 
    "level": "info", 
    "messages": ["{44b53aba-1970-4bd1-b741-ed1ae5a5051e}", "这是一条info日志", "Hello", "lajax"], 
    "url": "pages/index/index", 
    "agent": "微信小程序" 
}, { 
    "time": "2017-08-23 16:35:02.369", 
    "level": "warn", 
    "messages": ["{44b53aba-1970-4bd1-b741-ed1ae5a5051e}", "这是一条warn日志"], 
    "url": "pages/index/index", 
    "agent": "微信小程序" 
}]
```

各字段说明：

* `time`: 字符串，该条日志记录的时间

* `level`: 字符串，该条日志的级别，分为 `info`、`warn`、`error` 3 种

* `messages`: 数组，数组的第一个元素是大括号包裹的唯一[请求id](#请求id)，之后的所有元素对应调用 `console[level]` 依次传入的日志内容

* `url`: 字符串，该条日志所在页面的路径

* `agent`: 字符串，固定为"微信小程序"

## 请求id

发送到服务器的每一条日志，都包含一个请求 id。在同一次小程序应用访问中，所有日志的请求 id 一定相同；在不同请求中，各自记录的日志的请求 id 一定不同。

请求 id 的主要目的：让你能够在服务端精确定位到某次请求过程中的所有相关日志。

lajax4wx 会在初始化时生成一个基于时间的唯一 id 来作为请求 id，在小程序关闭之前，所有的日志都将包含该请求 id。

## 许可
The MIT License (MIT)

Copyright (c) 2017 孙正华

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
