// Filename - pages/ads.js

import {React, useState, useEffect, useRef} from "react";
import Container from 'react-bootstrap/Container';
import {Row, Col, Ratio } from 'react-bootstrap';
import { useParams } from "react-router-dom";
import html2canvas from "html2canvas";

import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work

var background = '/background.jpg'

var moment = require('moment');
moment.locale('fi')

const exportAsImage = async (element, imageFileName) => {
    const canvas = await html2canvas(element);
    const image = canvas.toDataURL("image/png", 1.0);

    downloadImage(image, imageFileName);
};
    
const downloadImage = (blob, fileName) => {
    const fakeLink = window.document.createElement("a");
    fakeLink.style = "display:none;";
    fakeLink.download = fileName;
    
    fakeLink.href = blob;
    
    document.body.appendChild(fakeLink);
    fakeLink.click();
    document.body.removeChild(fakeLink);
    
    fakeLink.remove();
};

const styles = {
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

const Ads = (props) => {
    const exportRef = useRef();
    const {timestamp} = useParams();

    const [state, setState] = useState({
        matches: [],
    });

    const [query, setQuery] = useState({
        date: timestamp
    });

    const setMatchData = (d) => {

        var dataItems = []
        d.map((data) => { return dataItems.push(data) })

        if (dataItems.length > 6) {
            dataItems = d.slice(0, 5)
        }

        setState({ matches: dataItems })
    }

    useEffect(() => {
        setQuery({date: timestamp})
    }, [timestamp])


    useEffect(() => {
        var uri = '/api/getGames'
        console.log('found date: ' + query.date)
        if (query.date) {            
            var formattedDate = moment(query.date).format('YYYY-MM-DD')
            uri += '?date=' + formattedDate
            console.log(uri)
        }

        fetch(uri)
        .then(response => response.json())
        .then(data => {
            setMatchData(data)
        }).catch(error => {
            //const data = [{"date":"2024-02-03 14:00","home":"Kiekko-Ahma sininen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"HPK Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114740.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-03 15:25","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"LeKi Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/100025201.png","rink":"Valkeakoski","level":"U13 AA"},{"date":"2024-02-03 16:50","home":"Kiekko-Ahma valkoinen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Uplakers Valkoiset","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10658853.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-03 18:15","home":"Kiekko-Ahma Valk.","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"K-Karhut","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114546.png","rink":"Valkeakoski","level":"U14 AA"}]
            const data = []
            setMatchData(data)
            console.log('Error occurred! ', error);
        });
      }, [query.date])

      const DateBox = ({date}) => {
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

        const dayStyle = Object.assign({}, styles.flex, styles.textShadow, { margin: '0px 0px 0px 0px', color: 'white', fontSize: '2.2vw' })        
        const timeStyle = Object.assign({}, styles.flex, styles.textShadow, { margin: '-5px 0px 0px 0px', color: 'white', fontSize: '2.2vw'})

        return (
            <Ratio style={dateBoxStyle}>
                <Container>
                    <Row style={dayStyle}>{moment(date).format('dd')}</Row>
                    <Row style={timeStyle}>{moment(date).format('HH:mm')}</Row>
                </Container>
            </Ratio>
        );
    }


      const gamesList = state.matches.map((data, index) => {

        const fullHeight = Object.assign({}, styles.flex, { height: '100%' })
        const smallTextStyle = Object.assign({}, styles.flex, fullHeight, { fontSize: '1.5vw' })
        const normalTextStyle = Object.assign({}, styles.flex, styles.textShadow, { fontSize: '2vw' })
        const homeTeamStyle = Object.assign({}, styles.flex, fullHeight, styles.textHighlight, { textAlign: 'center', fontSize: '1.8vw', color: 'orange', justifyContent: 'center'})
        const awayTeamStyle = Object.assign({}, styles.flex, fullHeight, styles.textShadow, {  textAlign: 'center', fontSize: '1.8vw', justifyContent: 'center'})
        const imageContainerStyle = Object.assign({}, styles.boxShadow, { aspectRatio: 1.0, backgroundColor: 'white', padding: '5px', height: '100%', overflow: 'hidden', borderRadius: '50%', objectFit: 'contain' })
        const imageStyle = Object.assign({}, { aspectRatio: 1.0, backgroundColor: 'white', padding: '5px', height: '100%', objectFit: 'contain' })
        const levelTextStyle = Object.assign({}, normalTextStyle, { justifyContent: 'center', textAlign: 'center'})

        return (
            <Row key={index} style={{ 
                borderRadius: '0px', 
                padding:'10px', 
                background: `linear-gradient( rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.25) )`,
                marginBottom: '20px', 
                height: '128px'}}>
                <Col xs={2} style={{justifyContent: 'center', height: '100%'}}>
                    <DateBox date={data.date}/>
                </Col>
                <Col xs={2} style={{height: '100%'}}>
                    <div style={homeTeamStyle}>{data.home}</div>
                </Col>
                <Col xs='auto' style={{height: '100%'}}>
                    <div style={imageContainerStyle}>
                        <img style={imageStyle} src={data.home_logo} alt=""/>
                    </div>
                </Col>
                <Col xs="auto" style={smallTextStyle}>VS</Col>
                <Col xs='auto' style={{height: '100%'}}>
                <div style={imageContainerStyle}>
                        <img style={imageStyle} src={data.away_logo} alt=""/>
                    </div>
                </Col>
                <Col xs={2} style={{height: '100%'}}>
                    <div style={awayTeamStyle}>{data.away}</div>
                </Col>
                <Col xs={2} style={levelTextStyle}>{data.level}</Col>
            </Row>
        )
      })

    const GamesList = () => {
        return (
            <div>
                { gamesList }
            </div>
        );
    }

    const getMonday = (d) => {
        if (d.getDay() === 1) {
            return d
        }
    
        while (d.getDay() !== 1) {
            d.setDate(d.getDate() - 1)
        }
    
        return d
    }

    const Content = () => {
        const titleTextStyle = Object.assign({}, styles.flex, styles.textShadow, {fontSize: '4vw'})
        const lineStyle = Object.assign({}, styles.boxShadow, {
            height: '5px', 
            width: '100%', 
            boxShadow: '0px 5px 15px #000000', 
            borderTop: '1px solid orange', 
            background: 'orange'})

        // Define the layout configuration for each grid item
        var now = new Date()
        if (query.date) {
            now = new Date(query.date)
        }

        const startOfWeek = getMonday(now)
        console.log(query.date)
        console.log(startOfWeek)
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(endOfWeek.getDate() + 6)

        const start = moment(startOfWeek).format('D.M')
        const end = moment(endOfWeek).format('D.M')

        const week = start + ' - ' + end
        return (            
            <div style={{
                height: "1080px",
                width: "1080px",
                background: `linear-gradient( rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 1.0) ), url(${background})`, 
                backgroundSize: 'cover',
                backgroundColor: '#000000',
                backgroundRepeat: 'no-repeat' }}>
                <Col>
                    <div style={Object.assign({}, styles.font, {margin: '0px 2vw 0px 2vw'})}>
                        <Container style={{paddingBottom: '6vh'}}>
                            <div style={Object.assign({}, styles.flex, titleTextStyle)}>TULEVAT KOTIOTTELUT ({week})</div>
                            <div style={lineStyle}></div>
                        </Container>

                        <GamesList/>
                    </div>
                </Col>
            </div>
        ) 
    }


    return ( 
        <div>
            <div style={{height: "1080px", width: "1080px", background: "#000000" }} ref={exportRef} >
                <Content/>
            </div>
            <div style={{height: '20px'}}></div>
            <button onClick={() => exportAsImage(exportRef.current, "GamesAd")}>Save Image</button>
        </div>
    )
}

export default Ads;
