const util = require('node:util')
const exec = util.promisify(require('node:child_process').exec)
const Client = require('ftp')
const fs = require('fs')

const ftpOptions = {
    host: 'ftp地址',
    user: 'ftp用户名',
    password: 'ftp密码',
    port: 21
}

const backupOption = {
    db_host: '数据库地址',
    db_name: '数据库名称',
    db_user: '用户名',
    db_password: '密码',
    backUpPath: '/db',        // FTP 备份保存路径
    backInterval: 18000000  // 5个小时执行一次
}

Client.prototype.cwdSync = function (path) {
    let self = this
    return new Promise((resolve, reject) => {
        self.cwd(path, (e, currentDir) => {
            resolve({e, currentDir})
        })
    })
}
Client.prototype.putSync = function (file, dest) {
    let self = this
    return new Promise((resolve, _) => {
        self.put(file, dest, false, (e) => {
            resolve({e})
        })
    })
}

function connectFtp(ftpOptions) {
    return new Promise((resolve, reject) => {
        let c = new Client()
        c.on('ready', () => {
            resolve({e: null, ftpClient: c})
        });
        c.on('error', (e) => {
            resolve({e, ftpClient: null})
        })
        c.connect(ftpOptions)
    })
}

async function backUpExec() {

    let {ftpClient} = await connectFtp(ftpOptions)
    let {e, currentDir} = await ftpClient.cwdSync(backupOption.backUpPath)
    if (e) {
        console.log(`-> 备份目录可能不存在！`)
    }
    // 导出数据库
    console.log(`-> 正在导出数据库 [ ${backupOption.db_name} ]...`)
    let {stderr, backDbFileName} = await dumpMysqlDb(backupOption)
    if (stderr) {
        console.log('导出数据库失败！')
    }
    console.log(`-> 成功导出数据库！[ ${backupOption.db_name} ] `)
    console.log(`-> 上传中... [ ${backDbFileName} ] `)
    let result = await ftpClient.putSync(backDbFileName, backDbFileName)
    if (result.e) {
        console.log('-> 上传数据库失败！')
    }
    console.log(`备份成功！${backupOption.backUpPath}/${backDbFileName}`)
    ftpClient.end()
    // 清理本地备份
    fs.rmSync(backDbFileName)
}

async function dumpMysqlDb(backupOption) {
    let date = new Date()
    let backDbFileName = `db_${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}_${date.getHours()}${date.getMinutes()}${date.getSeconds()}.sql.gz`
    const {stderr} = await exec(`mysqldump --host=${backupOption.db_host} -u${backupOption.db_user} -p${backupOption.db_password} ${backupOption.db_name} | gzip > ${backDbFileName}`);
    return {stderr, backDbFileName}
}

backUpExec().then()

setInterval(function () {
    backUpExec().then()
}, backupOption.backInterval)
