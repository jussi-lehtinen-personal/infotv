// Filename - pages/ads.js

import {React, useState, useEffect, useRef} from "react";
import {Row, Col } from 'react-bootstrap';
import { useParams } from "react-router-dom";
import { 
    getMockGameData,
    getMonday,
    DateBox, 
    styles,
    componentStyles,
    processIncomingDataEvents,
    buildGamesQueryUri
} from "../Util";

//import html2canvas from "html2canvas";

import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work

var background = '/background.jpg'

var moment = require('moment');
moment.locale('fi')

/*
const exportAsImage = async (element, imageFileName) => {
    const canvas = await html2canvas(element, {
        allowTaint: true,
        useCORS: true
    });
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
*/

const Ads = (props) => {
    const exportRef = useRef();
    const {timestamp} = useParams();

    const [state, setState] = useState({
        matches: [],
    });

    const [query, setQuery] = useState({
        date: timestamp
    });

    useEffect(() => {
        setQuery({date: timestamp})
    }, [timestamp])


    useEffect(() => {
        var uri = buildGamesQueryUri(query.date)

        const setMatchData = (d) => {

            var dataItems = processIncomingDataEvents(d)    
            setState({ matches: dataItems })
        }    

        fetch(uri)
        .then(response => response.json())
        .then(data => {
            setMatchData(data)
        }).catch(error => {
            const data = getMockGameData()
            setMatchData(data)
            console.log('Error occurred! ', error);
        });
      }, [query.date])

      const gamesList = state.matches.map((data, index) => {

        const fullHeight = Object.assign({}, styles.flex, { height: '100%' })
        const smallTextStyle = Object.assign({}, styles.flex, fullHeight, { fontSize: '20px' })
        const normalTextStyle = Object.assign({}, styles.flex, styles.textShadow, { fontSize: '30px' })
        const homeTeamStyle = Object.assign({}, styles.flex, fullHeight, styles.textHighlight, { textAlign: 'center', fontSize: '30px', color: 'orange', justifyContent: 'center'})
        const awayTeamStyle = Object.assign({}, styles.flex, fullHeight, styles.textShadow, {  textAlign: 'center', fontSize: '30px', justifyContent: 'center'})
        const levelTextStyle = Object.assign({}, normalTextStyle, { justifyContent: 'center', textAlign: 'center'})

        return (
            <Row key={index} style={{ 
                padding:'10px',
                margin: '10px 10px 10px 10px',
                height: '128px'}}>
                <Col xs={2} style={{justifyContent: 'center', height: '100%'}}>
                    <DateBox date={data.date}/>
                </Col>
                <Col xs={2} style={{height: '100%'}}>
                    <div style={homeTeamStyle}>{data.home}</div>
                </Col>
                <Col xs='auto' style={{height: '100%'}}>
                    <div style={componentStyles.logoContainer}>
                        <img style={componentStyles.logo} src={data.home_logo} alt=""/>
                    </div>
                </Col>
                <Col xs="auto" style={smallTextStyle}>VS</Col>
                <Col xs='auto' style={{height: '100%'}}>
                    <div style={componentStyles.logoContainer}>
                        <img style={componentStyles.logo} src={data.away_logo} alt=""/>
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

    const Content = () => {
        const titleTextStyle = Object.assign({}, styles.flex, styles.textShadow, {fontSize: '80px'})
        const lineStyle = Object.assign({}, styles.boxShadow, {
            height: '5px', 
            width: '100%',
            boxShadow: '0px 3px 10px #000000',
            background: `radial-gradient( white, orange, black )`, 
        })

        // Define the layout configuration for each grid item
        var now = new Date()
        if (query.date) {
            now = new Date(query.date)
        }

        const startOfWeek = getMonday(now)
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(endOfWeek.getDate() + 6)

        const start = moment(startOfWeek).format('D.M')
        const end = moment(endOfWeek).format('D.M')

        const week = start + ' - ' + end

        const footerStyle = Object.assign({}, {
            fontSize: '30px',
            color: 'white',
            alignItems: 'center'
        })

        return (            
            <div style={{
                height: "1080px",
                width: "1080px",
                background: `linear-gradient( rgba(85, 107, 47, 0.9), rgba(0, 0, 0, 1.0) ), url(${background})`, 
                backgroundSize: 'cover',
                backgroundColor: '#000000',
                backgroundRepeat: 'no-repeat'}}>
                <div style={Object.assign({}, 
                    styles.font,
                    {
                        height: '100%'
                    })}>
                    <div style={Object.assign({}, styles.flex, {
                        height: '128px'
                        })}>
                        <div style={Object.assign({}, styles.flex, titleTextStyle)}>KOTIOTTELUT {week}</div>
                    </div>
                    <div style={Object.assign({}, {
                        height: '5px'
                        })}>
                        <div style={lineStyle}></div>
                    </div>
                    <div style={Object.assign({}, {
                            height: '900px',
                            background: `linear-gradient( rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.35) )`
                        })}>
                        <div style={Object.assign({}, {width: '100%'})}>
                            <div style={{height: '20px'}} />
                            <GamesList/>
                        </div>
                    </div>
                    <div style={Object.assign({}, styles.flex, {
                            width: '100%',
                            height: '42px',
                            background: `black`
                        })}>
                        <div style={Object.assign({}, styles.flex, footerStyle)}>WWW.KIEKKO-AHMA.FI</div>
                    </div>
                </div>
            </div>
        ) 
    }

    /*
    {
        <div style={{height: '20px'}}></div>
        <button onClick={() => exportAsImage(exportRef.current, "GamesAd")}>Save Image</button>
    }
    */

    return ( 
        <div style={{height: "1080px", width: "1080px", background: "#000000" }} ref={exportRef} >
            <Content style={{height: "1080px", width: "1080px"}}/>
        </div>
    )
}

export default Ads;
