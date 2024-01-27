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
        fetch('api/schedule')
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
