import {Container, Row, Ratio } from 'react-bootstrap';

var moment = require('moment');
moment.locale('fi')

export const styles = {
    font: {
        fontFamily: 'Bebas Neue',
        color: '#EEEEEE'
    },
    
    textShadow: {
        textShadow: '0 3px 5px #000000'
    },

    textHighlight: {
        textShadow: '0 3px 2px #000000'
    },

    boxShadow: {
        boxShadow: '0px 3px 15px #000000'
    },

    flex: {
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
    },
}
export const componentStyles = {
    logoContainer: Object.assign({}, 
        styles.boxShadow, 
        { 
            aspectRatio: 1.0, 
            backgroundColor: 'white', 
            padding: '5px', 
            height: '100%',
            overflow: 'hidden', 
            borderRadius: '50%', 
            objectFit: 'contain' 
        }
    ),

    logo: Object.assign({}, 
        { 
            aspectRatio: 1.0, 
            padding: '5px', 
            height: '100%', 
            objectFit: 'contain' 
        }
    ),
}

const replaceAll = function(str, strReplace, strWith) {
    // See http://stackoverflow.com/a/3561711/556609
    var esc = strReplace.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    var reg = new RegExp(esc, 'ig');
    return str.replace(reg, strWith);
};

export const processIncomingDataEvents = (events) => {
    var dataItems = []
    events.map((data) => 
    {
        data.level = replaceAll(data.level, 'suomi-sarja', 'SS')
        data.level = replaceAll(data.level, 'U11 sarja', 'U11')
        data.level = replaceAll(data.level, 'U12 sarja', 'U12')

        return dataItems.push(data) 
    })

    if (dataItems.length > 6) {
        dataItems = dataItems.slice(0, 5)
    }
    return dataItems
};

export const getMockGameData = () => {
    // const data = [{"date":"2024-02-14 19:00","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Uplakers","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10658853.png","rink":"Valkeakoski","level":"II-divisioona"},{"date":"2024-02-17 17:15","home":"Kiekko-Ahma Valk.","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Pelicans Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/11019913.png","rink":"Valkeakoski","level":"U14 AA"},{"date":"2024-02-17 19:30","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Spirit","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/50017455.png","rink":"Valkeakoski","level":"U20 Suomi-sarja"},{"date":"2024-02-18 13:00","home":"Kiekko-Ahma sininen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Kisa-Eagles VALKOINEN","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/50003291.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-18 14:25","home":"Kiekko-Ahma valkoinen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Kisa-Eagles Keltainen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/50003291.png","rink":"Valkeakoski","level":"U11 sarja"}]
    const data = []
    return data
}

export const getMonday = (d) => {
    if (d.getDay() === 1) {
        return d
    }

    while (d.getDay() !== 1) {
        d.setDate(d.getDate() - 1)
    }

    return d
}

export const buildGamesQueryUri = (date) => {
    var uri = '/api/getGames'
    if (date) {            
        var formattedDate = moment(date).format('YYYY-MM-DD')
        uri += '?date=' + formattedDate
        console.log(uri)
    }
    return uri
};


export const DateBox = ({date}) => {
    const dateBoxStyle = Object.assign({}, {
        alignContent: 'center',
        justifyItems: 'center',
        alignSelf: 'center',
        aspectRatio: 1.0,
        height: '100%',
        borderRadius: '0px',
        boxShadow: '0px 5px 15px #000000', 
        background: "orange", 
        justifyContent: 'center', 
        alignItems: 'center'
    })

    const dayStyle = Object.assign({}, styles.flex, styles.textShadow, { margin: '0px 0px 0px 0px', color: 'white', fontSize: '40px' })        
    const timeStyle = Object.assign({}, styles.flex, styles.textShadow, { margin: '-5px 0px 0px 0px', color: 'white', fontSize: '30px'})

    return (
        <Ratio style={dateBoxStyle}>
            <Container>
                <Row style={dayStyle}>{moment(date).format('dd')}</Row>
                <Row style={timeStyle}>{moment(date).format('HH:mm')}</Row>
            </Container>
        </Ratio>
    );
}
