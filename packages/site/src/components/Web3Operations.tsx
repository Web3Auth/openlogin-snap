import { ReactNode } from 'react';
import styled from 'styled-components';

type CardProps = {
  content: {
    title: string;
  };
  fullWidth?: boolean;
  actionButtons: ReactNode[];
};

const CardWrapper = styled.div<{ fullWidth?: boolean }>`
  display: flex;
  flex-direction: column;
  width: ${({ fullWidth }) => (fullWidth ? '100%' : '250px')};
  background-color: ${({ theme }) => theme.colors.card.default};
  margin-top: 2.4rem;
  margin-bottom: 2.4rem;
  padding: 2.4rem;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.default};
  box-shadow: ${({ theme }) => theme.shadows.default};
  align-self: stretch;
  ${({ theme }) => theme.mediaQueries.small} {
    width: 100%;
    margin-top: 1.2rem;
    margin-bottom: 1.2rem;
    padding: 1.6rem;
  }
`;

const Title = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.large};
  margin: 0;
  margin-bottom: 1rem;
  ${({ theme }) => theme.mediaQueries.small} {
    font-size: ${({ theme }) => theme.fontSizes.text};
  }
`;

const DivStyle = styled.span`
  margin-bottom: 1rem;
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  align-self: stretch;
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  width: 100%;
  height: 100%;
`;

export const Web3Operations = ({
  content,
  fullWidth,
  actionButtons,
}: CardProps) => {
  const { title } = content;
  return (
    <CardWrapper fullWidth={fullWidth}>
      <Title>{title}</Title>
      <ButtonContainer>
        {actionButtons.map((x, index) => {
          return <DivStyle key={index}>{x}</DivStyle>;
        })}
      </ButtonContainer>
    </CardWrapper>
  );
};
