// Filename - pages/game_ads.js

import {React, useState, useEffect, useRef} from "react";
import {Row, Col} from 'react-bootstrap';
import { useParams } from "react-router-dom";
import { 
    getMockGameData,
    styles,
    componentStyles,
    processIncomingDataEvents,
    buildGamesQueryUri
} from "../Util";

//import html2canvas from "html2canvas";

import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work

var background = '/background3.jpg'
var metal_bg = '/metal_grid_bg.jpg'
var vs_img = '/vs.png'

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

const GameAds = (props) => {
    const exportRef = useRef();
    const {timestamp} = useParams();

    const [state, setState] = useState({
        match: {},
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
            setState({ match: dataItems[0] })
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

    const gamesList = (data) => {

        const fullHeight = Object.assign({}, styles.flex, { height: '100%' })
        const smallTextStyle = Object.assign({}, styles.flex, fullHeight, { fontSize: '40px' })
        const infoTextPrimaryStyle = Object.assign({}, styles.flex, styles.textShadow, { color: 'orange', fontSize: '60px' })
        const infoTextSecondaryStyle = Object.assign({}, styles.flex, styles.textShadow, { fontSize: '50px' })
        const homeTeamStyle = Object.assign({}, styles.textHighlight, { 
            textAlign: 'center', 
            fontSize: '50px', 
            color: 'orange', 
            justifyContent: 'center', 
            textShadow: '0 0px 15px orange'
        })
        const awayTeamStyle = Object.assign({}, styles.textShadow, { 
            textAlign: 'center', 
            fontSize: '50px', 
            justifyContent: 'center',
            textShadow: '0 0px 15px white'
        })

        return (
            <Row style={{ 
                padding:'10px',
                margin: '10px 10px 10px 10px',
                height: '250px'}}>
                <div style={Object.assign({}, {width: '20%'})}>
                    <div style={Object.assign({}, styles.boxShadow, {
                            background: '#202020',
                            boxShadow: '0px 3px 25px 10px #000000', 
                            height: '100%'
                        })}>
                        <div className="col" style={{padding: '10%', height: '100%'}}>
                            <div style={Object.assign({}, styles.textShadow, infoTextPrimaryStyle, {
                                height: '50%',
                            })}>{moment(data.date).format('dd D.M')}</div>
                            <div style={Object.assign({}, styles.textShadow, infoTextSecondaryStyle, {
                                height: '50%', 
                            })}>{moment(data.date).format('HH:mm')}</div>
                        </div>
                    </div>
                </div>
                <div className="col" style={Object.assign({}, {width: '100%', height: '100%'})}>
                    <div className="row" style={Object.assign({}, {
                            display: 'flex', 
                            justifyContent: 'center', 
                            height: '70%'})}>
                        <div style={Object.assign({}, componentStyles.logoContainer, {
                            boxShadow: '0px 3px 15px 15px #000000', 
                            height: '100%'
                            })}>
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
                <Col xs={1} style={Object.assign({}, smallTextStyle, {aspectRatio: 1.0, borderRadius:'50%'})}>
                <img style={{height: '75px'}} src={vs_img} alt=""/>
                </Col>
                <div className="col" style={Object.assign({}, {width: '100%', height: '100%'})}>
                    <div className="row" style={Object.assign({}, {
                            display: 'flex', 
                            justifyContent: 'center', 
                            height: '70%'})}>
                        <div style={Object.assign({}, componentStyles.logoContainer, {
                            boxShadow: '0px 3px 15px 15px #000000', 
                            height: '100%'
                            })}>
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

        return (            
            <div style={{
                height: "1080px",
                width: "1080px",
                background: `linear-gradient( rgba(0, 0, 0, 0.0), rgba(0, 0, 0, 1.0) ), url(${background})`,
                backgroundSize: 'contain',
                backgroundColor: '#000000',
                backgroundRepeat: 'no-repeat'}}>
                <div style={Object.assign({}, styles.flex, {
                            width: '100%',
                            height: '50px',
                            background: `black`
                        })}>
                    <div style={Object.assign({}, styles.font, styles.flex, footerStyle)}>WWW.KIEKKO-AHMA.FI</div>
                </div>

                <div style={Object.assign({}, styles.font,
                    {
                        height: '100%'
                    })}>

                    <div style={Object.assign({}, { height: '500px' })} />
                    <div style={Object.assign({}, { 
                            height: '180px',
                            //background: "#0F0F0F"
                            background: `linear-gradient( rgba(32, 32, 32, 1.0), rgba(48, 48, 48, 1.0), rgba(32, 32, 32, 1.0) )` 
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
                            background: `linear-gradient( rgba(0, 0, 0, 0.8), rgba(32, 32, 32, 0.9) ), url(${metal_bg})`
                        })}>
                        <div style={Object.assign({}, {width: '100%'})}>
                            <div style={{height: '20px'}} />
                            <GamesList/>
                        </div>
                    </div>
                    <div style={Object.assign({}, styles.flex, {
                            width: '100%',
                            height: '60px',
                            background: `black`
                        })}>
                        <div style={Object.assign({}, styles.flex, footerStyle)}>LIPUT 5 EUR | ALLE 15V. ILMAISEKSI SISÄÄN </div>
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

export default GameAds;
