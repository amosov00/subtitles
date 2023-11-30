
const source = document.querySelector("#input")

const btn = document.querySelector('#btn')

const checkbox = document.querySelector('[type="checkbox"]')

function handleOnChange() {
    window.API.logPath(source.files[0].path)
}

function handleOnClick() {
    window.API.buttonClick()
    source.value = ''
}

function handleOnCheck(){
    window.API.check(checkbox.checked)
}

btn.addEventListener('click', handleOnClick)
source.addEventListener('change', handleOnChange)
checkbox.addEventListener('change', handleOnCheck)

let options = ''
fetch('https://www.veed.io/api/v1/subtitles/languages').then((data) => {
    data.json().then((x) => {
        console.log(x.data)
        x.data.forEach(element => {
            options=options+`<option value="${element.value}">${element.label}</option>`
        });
        document.querySelector('#childrenContainer').appendChild(document.createRange().createContextualFragment(`
            <label for="langs">Choose a Lang:</label>
            <select name="langs" id="langs">
                ${options}
            </select>
        `))

        const langs = document.querySelector('#langs')
        function handleOnSelect(value) {
            window.API.selectLang(value.target.value)
        }
        langs.addEventListener('change', handleOnSelect)
    })
})

