## ADDED Requirements

### Requirement: The startable read answers resource fit

The startable read SHALL carry, for the project, each stated resource capacity with its
units occupied and free, and for each startable leaf whether its demand fits the free units now (fit is per leaf, since demand is per work item; a leaf that already holds a claim always fits, carrying its held units); leaves whose demand does not fit SHALL be listed apart, with their startable step ids, the first exhausting resource in resource-id order and the shortfall. Unstated capacities are not listed; a stated 0 is listed and excludes any demand on it. The read SHALL state that occupancy is counted within the
project only.

#### Scenario: One step fits, one does not

- **WHEN** 4 GB of `h2puni ram` are free, leaf A demands 4 GB and leaf B demands 8 GB, both
  otherwise startable
- **THEN** A's steps are listed as startable and B's steps are listed apart with `h2puni ram`
  and shortfall 4
