import {Container, Row, Ratio } from 'react-bootstrap';
import { toJpeg } from 'html-to-image';

var moment = require('moment');
moment.locale('fi')

// Enable this in order to use mock-data and request images directly from external services.
var dev = false //true

export const styles = {
    font: {
        fontFamily: 'Bebas Neue',
        color: '#EEEEEE'
    },
    
    textShadow: {
        textShadow: '0 1px 1px #000000'
    },

    textHighlight: {
        textShadow: '0 1px 1px #000000'
    },

    boxShadow: {
        boxShadow: '0px 1px 1px #000000'
    },

    flex: {
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
    },
}
export const componentStyles = {
    logoContainer: Object.assign({}, 
        { 
            aspectRatio: 1.0, 
            backgroundColor: 'white', 
            padding: '0px', 
            height: '100%',
            overflow: 'hidden', 
            objectFit: 'contain' 
        }
    ),

    roundLogoContainer: Object.assign({}, 
        { 
            aspectRatio: 1.0, 
            backgroundColor: 'white', 
            padding: '10px', 
            borderRadius: '50%',
            height: '100%',
            overflow: 'hidden', 
            objectFit: 'contain' 
        }
    ),

    logo: Object.assign({}, 
        { 
            aspectRatio: 1.0, 
            padding: '10%', 
            height: '100%', 
            objectFit: 'contain' 
        }
    ),
}

export const getAdsUri = (index, data) => {
    console.log("Navigate to " + index)
    var formattedDate = moment(data.date).format('YYYY-MM-DD')
    return "/ads/" + formattedDate + "/" + index;
}

export const htmlToImageConvert = (exp) => {
    toJpeg(exp, { cacheBust: false })
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = "kiekko-ahma-ad.jpg";
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => {
        console.log(err);
      });
  };


const replaceAll = function(str, strReplace, strWith) {
    // See http://stackoverflow.com/a/3561711/556609
    var esc = strReplace.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    var reg = new RegExp(esc, 'ig');
    return str.replace(reg, strWith);
};

export const getImageUri = (uri) => {
    var result = uri
    if (!dev) {
        result = "/api/getImage?uri=" + uri;
    }
    return result
}

export const processIncomingDataEvents = (events) => {
    var dataItems = []
    events.map((data) => 
    {
        if (!dev) {
            data.home_logo = "/api/getImage?uri=" + data.home_logo;
            data.away_logo = "/api/getImage?uri=" + data.away_logo;
        }
        data.level = replaceAll(data.level, 'suomi-sarja', 'SS')
        //data.level = replaceAll(data.level, 'U11 sarja', 'U11')
        //data.level = replaceAll(data.level, 'U12 sarja', 'U12')
        data.level = replaceAll(data.level, 'Harjoitusottelut', 'Harj.')
        data.level = replaceAll(data.level, 'Divisioona', 'Div')
        data.isFree = data.level !== 'II-divisioona'
        return dataItems.push(data) 
    })

    //if (dataItems.length > 6) {
    //    dataItems = dataItems.slice(0, 5)
    //}
    return dataItems
};

export const processIncomingDataEventsDoNotStrip = (events) => {
    var dataItems = []
    events.map((data) => 
    {
        if (!dev) {
            data.home_logo = "/api/getImage?uri=" + data.home_logo;
            data.away_logo = "/api/getImage?uri=" + data.away_logo;
        }

        data.isFree = data.level !== 'II-divisioona'
        return dataItems.push(data) 
    })
    return dataItems
};


export const getMockGameData = () => {
    var data = []
    if (dev) {
        data = [{"date":"2024-09-25 19:00","league":"II-divisioona, lohko 2","periods":{"PlayedPeriods":3,"PeriodGoals":{"Home":[1,0,3],"Away":[2,2,2]}},"home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"4","away":"Pyry Team","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114711.png","away_goals":"6","period":"2","finished":"1","rink":"Valkeakoski","level":"II-divisioona"},{"date":"2024-09-28 14:00","league":"U11 lohko 2b syksy","periods":{"PlayedPeriods":3,"PeriodGoals":{"Home":[1,4,1],"Away":[2,1,4]}},"home":"Kiekko-Ahma Oranssi","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"6","away":"HPK White","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114740.png","away_goals":"7","period":"2","finished":"1","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-09-28 16:00","league":"U16 Suomi-sarja, alkusarja, lohko 2","periods":{"PlayedPeriods":3,"PeriodGoals":{"Home":[1,1,0],"Away":[1,3,2]}},"home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"2","away":"KOOVEE","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114669.png","away_goals":"6","period":"2","finished":"1","rink":"Valkeakoski","level":"U16 Suomi-sarja"},{"date":"2024-09-28 18:45","league":"U18 II-divisioona, alkusarja, lohko 2","periods":{"PlayedPeriods":3,"PeriodGoals":{"Home":[0,3,3],"Away":[1,0,0]}},"home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"6","away":"HPK Team","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114740.png","away_goals":"1","period":"2","finished":"1","rink":"Valkeakoski","level":"U18 II-divisioona"},{"date":"2024-09-29 14:00","league":"U11 lohko 2a syksy","periods":{"PlayedPeriods":3,"PeriodGoals":{"Home":[1,0,5],"Away":[3,4,3]}},"home":"Kiekko-Ahma Musta","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"6","away":"HPK Orange","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114740.png","away_goals":"10","period":"2","finished":"1","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-09-29 15:30","league":"U12 lohko 2b syksy","periods":{"PlayedPeriods":0,"PeriodGoals":{"Home":[],"Away":[]}},"home":"Kiekko-Ahma valkoinen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"0","away":"Kisa-Eagles SININEN","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/50003291.png","away_goals":"6","period":"2","finished":"1","rink":"Valkeakoski","level":"U12 sarja"}]
    }
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
        background: "white",
        justifyContent: 'center', 
        alignItems: 'center'
    })

    const dayStyle = Object.assign({}, styles.flex, styles.textShadow, { margin: '0px -10px 0px -10px', color: 'black', fontSize: '30px' })        
    const timeStyle = Object.assign({}, styles.flex, styles.textShadow, { margin: '-0px 0px 0px 0px', color: 'orange', fontSize: '25px'})

    return (
        <Ratio style={dateBoxStyle}>
            <Container>
                <Row style={dayStyle}>{moment(date).format('dd D.M')}</Row>
                <Row style={timeStyle}>{moment(date).format('HH:mm')}</Row>
            </Container>
        </Ratio>
    );
}
