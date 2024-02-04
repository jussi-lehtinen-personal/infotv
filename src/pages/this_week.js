// Filename - pages/this_week.js

import {React, useState, useEffect} from "react";
import Container from 'react-bootstrap/Container';
import {Row, Col, Ratio } from 'react-bootstrap';
import { useOrientation } from 'react-use';

import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work

var background = '/background.jpg'

var moment = require('moment');
moment.locale('fi')

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

const ThisWeek = () => {

    const {type} = useOrientation(); 
    const [state, setState] = useState({
        matches: []
    });

    const setMatchData = (d) => {

        var dataItems = []
        d.map((data) => { return dataItems.push(data) })

        if (dataItems.length > 6) {
            dataItems = d.slice(0, 5)
        }

        while (dataItems.length < 6) {
            dataItems.push({
                date: "",
                home: "",
                home_logo: "",
                away: "",
                away_logo: "",
                rink: "",
                level: ""
            })
        }

        setState({ matches: dataItems })
    }

    useEffect(() => {
        fetch('api/getGames')
        .then(response => response.json())
        .then(data => {
            setMatchData(data)
        }).catch(error => {
            const data = [{"date":"2024-02-03 14:00","home":"Kiekko-Ahma sininen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"HPK Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114740.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-03 15:25","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"LeKi Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/100025201.png","rink":"Valkeakoski","level":"U13 AA"},{"date":"2024-02-03 16:50","home":"Kiekko-Ahma valkoinen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Uplakers Valkoiset","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10658853.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-03 18:15","home":"Kiekko-Ahma Valk.","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"K-Karhut","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114546.png","rink":"Valkeakoski","level":"U14 AA"}]
            setMatchData(data)
            console.log('Error occurred! ', error);
        });
      }, [])

      const DateBox = ({valid, date, size, landscape}) => {
        const dateBoxStyle = Object.assign({}, {
            alignContent: 'center',
            justifyItems: 'center',
            alignSelf: 'center',
            aspectRatio: 1.0,
            height: '100%',
            width: size,
            borderRadius: '5px',
            boxShadow: '0px 5px 15px #000000', 
            background: "orange", 
            justifyContent: 'center', 'alignItems': 'center'
        })

        const dayStyle = landscape ?  
            Object.assign({}, styles.flex, styles.textShadow, { fontSize: '2.6vw' }) : 
            Object.assign({}, styles.flex, styles.textShadow, { fontSize: '4.6vw' })
        
            const timeStyle = landscape ?  
            Object.assign({}, styles.flex, styles.textShadow, { fontSize: '1.9vw'}) :
            Object.assign({}, styles.flex, styles.textShadow, { fontSize: '4.4vw'})

        return (
            <Ratio style={dateBoxStyle}>
                <Container>
                    <Row style={dayStyle}>{valid ? moment(date).format('dd') : ""}</Row>
                    <Row style={timeStyle}>{valid ? moment(date).format('HH:mm') : ""}</Row>
                </Container>
            </Ratio>
        );
    }


      const gamesListPortrait = state.matches.map((data, index) => {
        const imageSize = '14wv'

        const isValidItem = data.home.length > 0
        const smallTextStyle = Object.assign({}, styles.flex, { fontSize: '3.5vw' })
        const normalTextStyle = Object.assign({}, styles.flex, styles.textShadow, { fontSize: '4vw' })
        const imageContainerStyle = Object.assign({}, styles.flex, {height: imageSize, width: imageSize})
        const imageStyle = Object.assign({}, styles.boxShadow, { backgroundColor: 'white', padding: '5px', height: '14vw', width: '14vw', borderRadius: '10%', objectFit: 'contain' })
        const levelTextStyle = Object.assign({}, normalTextStyle, { justifyContent: 'start' })

        return (
            <Row key={index} style={{paddingBottom: '10px', opacity: isValidItem ? 1 : 0.5}}>
                <Col md='auto' style={{
                        alignSelf: 'center',
                        display: 'flex',
                        height: '100%',
                        width: '14vw',
                        aspectRatio: 1,
                        justifyContent: 'center', 'alignItems': 'center'
                        }}>
                    <DateBox size={imageSize} valid={isValidItem} date={data.date}  landscape={false}/>
                </Col>
                <Col xs={1} />
                <Col xs={3} hidden={isValidItem ? false : true}>
                    <Ratio style={imageContainerStyle} >
                        <img style={imageStyle} src={data.home_logo} alt=""/>
                    </Ratio>
                </Col>
                <Col xs={1} hidden={isValidItem ? false : true} style={smallTextStyle}>vs</Col>
                <Col xs={3} hidden={isValidItem ? false : true}>
                    <Ratio style={imageContainerStyle} >
                        <img style={imageStyle} src={data.away_logo} alt=""/>
                    </Ratio>
                </Col>
                <Col xs={2} style={levelTextStyle}>{data.level}</Col>
            </Row>
        )
      })

      const gamesListLandscape = state.matches.map((data, index) => {
        const imageSize = '7wv'

        const isValidItem = data.home.length > 0
        const smallTextStyle = Object.assign({}, styles.flex, { fontSize: '1.5vw' })
        const normalTextStyle = Object.assign({}, styles.flex, styles.textShadow, { fontSize: '2vw' })
        const highlightTextStyle = Object.assign({}, styles.flex, styles.textHighlight, { fontSize: '2vw', color: 'orange' })
        const imageContainerStyle = Object.assign({}, styles.flex, {height: imageSize, width: imageSize})
        const imageStyle = Object.assign({}, styles.boxShadow, { backgroundColor: 'white', padding: '5px', height: '7vw', width: '7vw', borderRadius: '10%', objectFit: 'contain' })
        const levelTextStyle = Object.assign({}, normalTextStyle, { justifyContent: 'start' })

        return (
            <Row key={index} style={{paddingBottom: '10px', opacity: isValidItem ? 1 : 0.5}}>
                <Col xs={1} style={{
                        alignSelf: 'center',
                        display: 'flex',
                        height: '100%',
                        width: '7vw',
                        aspectRatio: 1,                            
                        justifyContent: 'center', 'alignItems': 'center'
                        }}>
                    <DateBox size={imageSize} valid={isValidItem} date={data.date} landscape={true}/>
                </Col>
                <Col xs={1} />
                <Col style={Object.assign({}, highlightTextStyle, {justifyContent: 'end'})}>{data.home}</Col>
                <Col xs={1} hidden={isValidItem ? false : true}>
                    <Ratio style={imageContainerStyle} >
                        <img style={imageStyle} src={data.home_logo} alt=""/>
                    </Ratio>
                </Col>
                <Col hidden={isValidItem ? false : true} md='auto' style={smallTextStyle}>vs</Col>
                <Col xs={1} hidden={isValidItem ? false : true}>
                    <Ratio style={imageContainerStyle} >
                        <img style={imageStyle} src={data.away_logo} alt=""/>
                    </Ratio>
                </Col>
                <Col style={Object.assign({}, normalTextStyle, {justifyContent: 'start'})}>{data.away}</Col>
                <Col md={2} style={levelTextStyle}>{data.level}</Col>
            </Row>
        )
      })

    const PortraitContent = () => {
        return (
            <div>
                { gamesListPortrait }
            </div>
        );
    }

    const LandscapeContent = () => {
        return (
            <div>
                { gamesListLandscape }
            </div>
        );
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
        const now = new Date()
        var startOfWeek = new Date()
        startOfWeek.setDate(now.getDate() - (now.getDay() + 6) % 7);

        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(endOfWeek.getDate() + 6)

        const start = moment(startOfWeek).format('D.M')
        const end = moment(endOfWeek).format('D.M')

        const week = start + ' - ' + end
        return (
            <div style={{height: "100vh", background: "#000000" }}>
                <Col style={{
                    background: `linear-gradient( rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 1.0) ), url(${background})`, 
                    backgroundSize: 'cover',
                    backgroundColor: '#000000',
                    backgroundRepeat: 'no-repeat' }}>
                    <div style={Object.assign({}, styles.font, {margin: '0px 5vw 0px 5vw'})}>
                        <Container style={{paddingBottom: '6vh'}}>
                            <div style={Object.assign({}, styles.flex, titleTextStyle)}>TULEVAT KOTIOTTELUT ({week})</div>
                            <div style={lineStyle}></div>
                        </Container>

                        {
                            type === 'landscape-primary' ? 
                            (<LandscapeContent />) : 
                            (<PortraitContent />)
                        } 
                    </div>
                </Col>
            </div>
        ) 
    }


    return ( 
        <Content />
    )
}

export default ThisWeek;
