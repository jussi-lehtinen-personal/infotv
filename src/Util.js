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
            padding: '0px', 
            height: '100%',
            overflow: 'hidden', 
            borderRadius: '50%', 
            objectFit: 'contain' 
        }
    ),

    logo: Object.assign({}, 
        { 
            aspectRatio: 1.0, 
            padding: '15%', 
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
        data.level = replaceAll(data.level, 'U11 sarja', 'U11')
        data.level = replaceAll(data.level, 'U12 sarja', 'U12')
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
    // const data = [{"date":"2024-02-14 19:00","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Uplakers","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10658853.png","rink":"Valkeakoski","level":"II-divisioona"},{"date":"2024-02-17 17:15","home":"Kiekko-Ahma Valk.","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Pelicans Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/11019913.png","rink":"Valkeakoski","level":"U14 AA"},{"date":"2024-02-17 19:30","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Spirit","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/50017455.png","rink":"Valkeakoski","level":"U20 Suomi-sarja"},{"date":"2024-02-18 13:00","home":"Kiekko-Ahma sininen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Kisa-Eagles VALKOINEN","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/50003291.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-18 14:25","home":"Kiekko-Ahma valkoinen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Kisa-Eagles Keltainen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/50003291.png","rink":"Valkeakoski","level":"U11 sarja001"}]

    var data = []
    if (dev) {
        data = [{"date":"2024-10-05 13:00","home":"Kiekko-Ahma Oranssi","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","away":"KOOVEE Red/Syksy","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114669.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-10-05 14:30","home":"Kiekko-Ahma Musta","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","away":"Sisu Punainen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/11015646.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-10-05 16:00","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","away":"Ilves Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114698.png","rink":"Valkeakoski","level":"U13 AA"},{"date":"2024-10-05 17:30","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","away":"PK 83","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114313.png","rink":"Valkeakoski","level":"U14 AA"},{"date":"2024-10-05 19:30","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","away":"Pelicans Team","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/11019913.png","rink":"Valkeakoski","level":"U18 II-divisioona"}]
        //data = [{"date":"2024-03-13 19:00","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"HiHo","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114355.png","rink":"Valkeakoski","level":"II-divisioona"},{"date":"2024-03-14 18:50","home":"Kiekko-Ahma Valk","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Pingviinit ","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114517.png","rink":"Valkeakoski","level":"U15 A"},{"date":"2024-03-16 15:15","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"VaPS Sininen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114122.png","rink":"Valkeakoski","level":"U12 sarja"},{"date":"2024-03-16 16:45","home":"Kiekko-Ahma Valk.","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Tappara Oranssi","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114562.png","rink":"Valkeakoski","level":"U14 AA"},{"date":"2024-03-16 19:00","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Uplakers","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10658853.png","rink":"Valkeakoski","level":"U18 Suomi-sarja"},{"date":"2024-03-17 13:00","home":"Kiekko-Ahma sininen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"HC Nokia Mustat","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10635371.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-03-17 14:25","home":"Kiekko-Ahma valkoinen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Fortuna ","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114766.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-03-17 17:30","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"HiHo","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114355.png","rink":"Valkeakoski","level":"II-divisioona"}]; 
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
        boxShadow: '0px 5px 15px #000000', 
        background: "orange",
        justifyContent: 'center', 
        alignItems: 'center'
    })

    const dayStyle = Object.assign({}, styles.flex, styles.textShadow, { margin: '0px -10px 0px -10px', color: 'white', fontSize: '30px' })        
    const timeStyle = Object.assign({}, styles.flex, styles.textShadow, { margin: '-0px 0px 0px 0px', color: 'white', fontSize: '25px'})

    return (
        <Ratio style={dateBoxStyle}>
            <Container>
                <Row style={dayStyle}>{moment(date).format('dd D.M')}</Row>
                <Row style={timeStyle}>{moment(date).format('HH:mm')}</Row>
            </Container>
        </Ratio>
    );
}
