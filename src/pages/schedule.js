// Filename - pages/schedule.js

import React from "react";



class Schedule extends React.Component {
    componentDidMount() {
        const uri = 'https://valkeakoski.tilamisu.fi/fi/locations/836/reservations.json?timeshift=-120&from=2024-01-15&to=2024-01-22'

        let headers = new Headers();
        headers.append('Access-Control-Allow-Origin', 'http://localhost:3000')
        headers.append('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        //headers.append('Accept', 'application/json');
        //headers.append('Origin','http://localhost:3000');

        fetch(uri/*, {headers: headers}*/)
            .then(response => response.json())
            .then(data => {
                console.log(data) 
                this.setState({ items: data })
            }).catch(error => {
                console.log('Error occurred! ', error);
            });
    }

    render() {
        //const { items } = this.state;
        return (
            <div>
                {
                    //items.map(item => (
                    //<div key={item.id}>
                    //    <h1>{item.title}</h1>
                    //    <p>{item.body}</p>
                    //</div>
                //))
                }
            </div>
        );
    }
}

export default Schedule;
