// Filename - pages/schedule.js

import React from "react";



class Schedule extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            items: []
        }
    }

    componentDidMount() {
        const server = '/tilamisu' //'https://valkeakoski.tilamisu.fi'
        const requestUri = '/fi/locations/836/reservations.json?timeshift=-120&from=2024-01-15&to=2024-01-22'

        fetch(server + requestUri, 
            { 
                method: 'GET', 
                headers : {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                    'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
                }
            })
            .then(response => response.json())
            .then(data => {
                this.setState({ items: data })
            }).catch(error => {
                console.log('Error occurred! ', error);
            });
    }

    render() {
        const { items } = this.state

        //items.map(item => {
        //    console.log(item)
        //})
        return (
            <div>
            {
                items.map(item => (
                <div key={item.id}>
                    <h5>{item.text}</h5>
                    <div>
                    <p>{item.start_date} - {item.end_date}</p>
                    </div>
                </div>
            ))
            }

            </div>
        );
    }
}

export default Schedule;
