const {contextBridge, ipcRenderer} = require("electron")

contextBridge.exposeInMainWorld('API', {
    logPath: (args) => {
        ipcRenderer.invoke('log-path', args)
    },
    buttonClick: () => {
        ipcRenderer.invoke('button-click')
    },
    check: (args) => {
        ipcRenderer.invoke('check', args)
    },
    selectLang: (args) => {
        ipcRenderer.invoke('select-lang', args)
    }
})