// Filename - pages/ads.js

import {React, useState, useEffect, useRef} from "react";
import {Row, Col, Container } from 'react-bootstrap';
import { useParams, useNavigate } from "react-router-dom";
import { 
    getMockGameData,
    getMonday,
    DateBox, 
    styles,
    componentStyles,
    processIncomingDataEvents,
    buildGamesQueryUri,
    getAdsUri,
    htmlToImageConvert
} from "../Util";

import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work

var metal_bg = '/metal_grid_bg2.jpg'

var moment = require('moment');
moment.locale('fi')


const Ads = (props) => {
    const exportRef = useRef();
    const navigate = useNavigate();

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
            <div style={{fullHeight}} onClick={() => {navigate(getAdsUri(index, data))}}>
            <Row key={index} style={{ 
                padding:'12px',
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
            </div>
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
        const titleTextStyle = Object.assign({}, styles.flex, styles.textShadow, {height: '60px', fontSize: '60px'})
        const titleText2Style = Object.assign({}, styles.flex, styles.textShadow, {color: 'orange', height: '45px', fontSize: '45px'})
        const lineStyle = Object.assign({}, styles.boxShadow, {
            height: '5px', 
            width: '100%',
            boxShadow: '0px 8px 10px 5px #000000',
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
                minHeight: "1080px",
                width: "1080px"}}>
                <div style={Object.assign({}, 
                    styles.font,
                    {
                        height: '100%'
                    })}>
                    <div style={Object.assign({}, styles.flex, {
                        height: '108px',
                        background: `linear-gradient( rgba(32, 32, 32, 1.0), rgba(48, 48, 48, 1.0), rgba(32, 32, 32, 1.0) )` 
                        })}>
                        <div>
                            <div style={Object.assign({}, titleTextStyle)}>KOTIOTTELUT TÄLLÄ VIIKOLLA</div>
                        </div>
                    </div>
                    <div style={Object.assign({}, styles.flex, {
                        height: '5px'
                        })}>
                        <div style={lineStyle}></div>
                    </div>
                    <div style={Object.assign({}, {
                            minHeight: '920px',
                            background: `linear-gradient( rgba(24, 24, 24, 1.0), rgba(64, 64, 64, 1.0) )`
                        })}>
                        <div style={Object.assign({}, {width: '100%'})}>
                            <div style={Object.assign({}, styles.flex, {height: '20px'})} />
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
    

    return ( 
        <div>
            <div style={{minHeight: "1080px", width: "1080px", background: "#000000" }} ref={exportRef} >
                <Content style={{minHeight: "1080px", width: "1080px"}}/>
            </div>
            <div style={{height: '20px'}}/>
            <Container>
                <Row>
                    <button onClick={() => htmlToImageConvert(exportRef.current)}>Downloag Image (JPG, 1080 x 1080)</button>
                </Row>
            </Container>        
            <div style={{height: '20px'}}/>
        </div>
    )
}

export default Ads;
