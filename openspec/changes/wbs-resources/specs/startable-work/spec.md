## ADDED Requirements

### Requirement: The startable read answers resource fit

The startable read SHALL carry, for the project, each stated resource capacity with its
units occupied and free, and for each startable step whether its leaf's demand fits the free
units now; steps whose demand does not fit SHALL be listed apart with the exhausting
resource and the shortfall. The read SHALL state that occupancy is counted within the
project only.

#### Scenario: One step fits, one does not

- **WHEN** 4 GB of `h2puni ram` are free, leaf A demands 4 GB and leaf B demands 8 GB, both
  otherwise startable
- **THEN** A's steps are listed as startable and B's steps are listed apart with `h2puni ram`
  and shortfall 4
