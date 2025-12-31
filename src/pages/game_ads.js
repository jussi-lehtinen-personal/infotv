// Filename - pages/game_ads.js

import {React, useState, useEffect, useRef} from "react";
import {Row, Col, Container} from 'react-bootstrap';
import { useParams } from "react-router-dom";
import { 
    getMockGameData,
    styles,
    componentStyles,
    processIncomingDataEventsDoNotStrip,
    buildGamesQueryUri,
    htmlToImageConvert,
    getImageUri
} from "../Util";

import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work

var backgrounds = [
    '/background.jpg',
    '/background2.jpg',
    '/background3.jpg',
    '/background4.jpg',
    '/background5.jpg',
    '/background6.jpg',
]

const randomBackground = Math.floor(Math.random() * backgrounds.length)

var moment = require('moment');
moment.locale('fi')

const GameAds = (props) => {
    const exportRef = useRef();
    const {timestamp, gameId} = useParams();

    const [state, setState] = useState({
        match: {}
    });

    const [visuals, setVisuals] = useState({
        background: backgrounds[randomBackground]
    });

    const [query, setQuery] = useState({
        date: timestamp,
    });

    useEffect(() => {
        setQuery({date: timestamp})
    }, [timestamp])


    useEffect(() => {
        var uri = buildGamesQueryUri(query.date)

        var g_id = 0       
        if (gameId) {
            g_id = gameId
        }

        setVisuals({background: backgrounds[randomBackground]})

        const setMatchData = (d, g_id) => {

            var dataItems = processIncomingDataEventsDoNotStrip(d)
            if (dataItems.length > g_id) {
                setState({ match: dataItems[g_id]})
            } else {
                // Do nothing.
            }
        }    

        fetch(uri)
        .then(response => response.json())
        .then(data => {
            setMatchData(data, g_id)            
        }).catch(error => {
            const data = getMockGameData()
            setMatchData(data, g_id)
            console.log('Error occurred! ', error);
        });
      }, [query.date, gameId])

    const gamesList = (data) => {

        const fullHeight = Object.assign({}, styles.flex, { height: '100%' })
        const smallTextStyle = Object.assign({}, styles.flex, fullHeight, { fontSize: '40px' })
        const infoTextPrimaryStyle = Object.assign({}, styles.flex, styles.textShadow, { color: 'white', fontSize: '50px' })
        const infoTextSecondaryStyle = Object.assign({}, styles.flex, styles.textShadow, { fontSize: '50px' })
        const homeTeamStyle = Object.assign({}, styles.textHighlight, { 
            textAlign: 'center', 
            fontSize: '50px', 
            color: 'orange', 
            justifyContent: 'center'
        })
        const awayTeamStyle = Object.assign({}, styles.textShadow, { 
            textAlign: 'center', 
            fontSize: '50px', 
            justifyContent: 'center'
        })

        return (
            <Row style={{ 
                padding:'10px',
                margin: '10px 10px 10px 10px',
                height: '240px'}}>
                <div className="col" style={Object.assign({}, {width: '100%', height: '100%'})}>
                    <div className="row" style={Object.assign({}, {
                            display: 'flex', 
                            justifyContent: 'center', 
                            height: '70%'})}>
                        <div style={componentStyles.roundLogoContainer}>
                            <img style={componentStyles.logo} src={data.home_logo} alt=""/>
                        </div>
                    </div>
                    <div className="row" style={Object.assign({}, {
                            display: 'flex', 
                            justifyContent: 'center', 
                            height: '30%'})}> 
                        <div style={homeTeamStyle}>{data.home}</div>
                    </div>
                </div>
                <Col xs={4} style={Object.assign({}, smallTextStyle, {aspectRatio: 1.0, borderRadius:'50%'})}>
                <div>
                    <div style={Object.assign({}, {height: '100%'})}>
                        <div style={Object.assign({}, styles.boxShadow, {
                                background: 'rgba(255, 165, 0, 0.8)'
                            })}>
                            <div className="col">
                                <div style={Object.assign({}, styles.textShadow, infoTextPrimaryStyle)}>{moment(data.date).format('dd D.M')}</div>
                            </div>
                        </div>
                    </div>
                    <div style={Object.assign({}, styles.textShadow, infoTextSecondaryStyle, {
                                    height: '50%', 
                                })}>-   </div>
                    <div style={Object.assign({}, {width: '100%'})}>
                        <div style={Object.assign({}, styles.boxShadow, {
                                background: 'rgba(32, 32, 32, 0.9)',
                                height: '80%'
                            })}>
                                <div style={Object.assign({}, styles.textShadow, infoTextSecondaryStyle, {
                                    height: '50%', 
                                })}>{moment(data.date).format('HH:mm')}
                                </div>
                        </div>
                    </div>
                </div>
                </Col>
                <div className="col" style={Object.assign({}, {width: '100%', height: '100%'})}>
                    <div className="row" style={Object.assign({}, {
                            display: 'flex', 
                            justifyContent: 'center', 
                            height: '70%'})}>
                        <div style={componentStyles.roundLogoContainer}>
                            <img style={componentStyles.logo} src={data.away_logo} alt=""/>
                        </div>
                    </div>
                    <div className="row" style={Object.assign({}, {
                            display: 'flex', 
                            justifyContent: 'center',
                            height: '30%'})}> 
                        <div style={awayTeamStyle}>{data.away}</div>
                    </div>
                </div>
            </Row>
        )
    }

    const GamesList = () => {
        return (
            <div>
                { gamesList(state.match) }
            </div>
        );
    }

    const Content = () => {
        const titleTextStyle = Object.assign({}, styles.flex, styles.textShadow, {fontSize: '80px'})
        const secondaryTextStyle = Object.assign({}, styles.flex, styles.textShadow, {color: 'orange', fontSize: '50px'})
        
        const lineStyle = Object.assign({}, styles.boxShadow, {
            height: '5px', 
            width: '100%',
            background: `radial-gradient( white, orange, black )`, 
            boxShadow: '0px 3px 10px #000000',
            })

        const footerStyle = Object.assign({}, {
            fontSize: '30px',
            color: 'white',
            alignItems: 'center'
        })

        var bgImage = visuals.background
        if (!bgImage.startsWith('/')) {
            bgImage = getImageUri(visuals.background)
        }

        return (            
            <div style={{
                height: "1080px",
                width: "1080px",
                background: `linear-gradient( rgba(0, 0, 0, 0.0), rgba(0, 0, 0, 1.0) ), url(${bgImage})`,
                backgroundSize: 'cover',
                backgroundColor: '#000000',
                backgroundRepeat: 'no-repeat'}}>
                <div style={Object.assign({}, styles.flex, {
                            width: '100%',
                            height: '50px',
                            background: `rgba(16, 16, 16, 0.5)`
                        })}>
                    <div style={Object.assign({}, styles.font, styles.flex, footerStyle)}>WWW.KIEKKO-AHMA.FI</div>
                </div>

                <div style={Object.assign({}, styles.font,
                    {
                        height: '100%'
                    })}>

                    <div style={Object.assign({}, { height: '520px' })} />
                    <div style={Object.assign({}, { 
                            height: '160px',
                            //background: "#0F0F0F"
                            background: `linear-gradient( rgba(32, 32, 32, 1.0), rgba(48, 48, 48, 0.5), rgba(32, 32, 32, 0.5) )` 
                        })}>
                        <div style={Object.assign({}, { height: '15px' })}>
                            <div style={lineStyle}></div>
                        </div>
                        <div style={Object.assign({}, styles.flex, { height: '45%' })}>
                            <div style={Object.assign({}, styles.flex, titleTextStyle)}>KIEKKO-AHMA</div>
                        </div>
                        <div style={Object.assign({}, { height: '40%' })}>
                            <div style={Object.assign({}, styles.flex, secondaryTextStyle)}>{state.match.level}</div>
                        </div>
                        <div style={Object.assign({}, { height: '15px' })}>
                            <div style={lineStyle}></div>
                        </div>
                    </div>
                    <div style={Object.assign({}, {
                            height: '300px',
                            background: `linear-gradient( rgba(64, 64, 64, 0.0), rgba(0, 0, 0, 1.0) )`
                        })}>
                        <div style={Object.assign({}, {width: '100%'})}>
                            <div style={{height: '20px'}} />
                            <GamesList/>
                        </div>
                    </div>
                    <div style={Object.assign({}, styles.flex, {
                            width: '100%',
                            height: '60px',
                            background: "#0F0F0F"
                        })}>
                        <div style={Object.assign({}, styles.flex, footerStyle)}>
                            <div hidden={state.match.isFree}>OTTELU PELATAAN WAREENASSA | LIPUT 5 EUR | ALLE 15V. ILMAISEKSI SISÄÄN</div>
                            <div hidden={!state.match.isFree}>OTTELU PELATAAN WAREENASSA | ILMAINEN SISÄÄNPÄÄSY</div>
                        </div>
                    </div>
                </div>
            </div>
        ) 
    }

    return ( 
        <div>
            <div style={{height: "1080px", width: "1080px", background: "#000000" }} ref={exportRef} >
                <Content style={{height: "1080px", width: "1080px"}}/>
            </div>
            <div style={{height: '20px'}}/>
            <div style={{width: '1080px'}}>
                <Container fluid>
                    <Row>
                    <Col xs={2} ><label htmlFor={state.homeTeamId}>Home Team:</label></Col>
                    <Col><input style={{width: '100%'}} id={state.homeTeamId} name="home" value={state.match.home} onChange={e => {
                                state.match.home = e.target.value
                                setState({ match: state.match })
                                }
                            }/></Col>
                    </Row>
                    <Row>
                        <Col xs={2} ><label htmlFor={state.awayTeamId}>Away Team:</label></Col>
                        <Col><input style={{width: '100%'}} id={state.awayTeamId} name="away" value={state.match.away} onChange={e => {
                                    state.match.away = e.target.value
                                    setState({ match: state.match })
                                    }
                                }/></Col>
                    </Row>
                    <Row>
                        <Col xs={2} ><label htmlFor={state.levelId}>League:</label></Col>
                        <Col><input style={{width: '100%'}} id={state.levelId} name="level" value={state.match.level} onChange={e => {
                                    state.match.level = e.target.value
                                    setState({ match: state.match })
                                    }
                                }/></Col>
                    </Row>
                    <Row>
                        <Col xs={2} ><label htmlFor={state.imageId}>Image:</label></Col>
                        <Col><input style={{width: '100%'}} id={state.imageId} name="background" value={visuals.background} onChange={e => {
                                    state.background = e.target.value
                                    setVisuals({ background: state.background })
                                    }
                                }/></Col>
                    </Row>
                    <Row>
                        <Col>
                            <button style={{width: '100%'}} onClick={() => htmlToImageConvert(exportRef.current)}>Downloag Image (JPG, 1080 x 1080)</button>
                        </Col>
                    </Row>
                </Container>
                </div>
            <div style={{height: '20px'}}/>
        </div>
    )
}

export default GameAds;
